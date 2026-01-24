import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Appearance } from "@stripe/stripe-js";
import { Check, Trash2 } from "lucide-react";
import { fetchJson } from "@/api/client";
import type { ApiResponse, PaymentResponse } from "@/api/types";
import { toast } from "@/ui/toast";
import { copyText } from "@/lib/clipboard";
import { formatUnixSeconds } from "@/lib/time";
import { confirmModal } from "@/ui/confirmModal";
import { useAuth } from "@/stores/auth/AuthStore";
import { useStatus } from "@/stores/status/StatusStore";
import { ThemeContext } from "@/theme/ThemeProvider";
import {
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  Modal,
  Spinner,
  TextField,
} from "@/components/ui/heroui";

type TopUpInfo = {
  enable_stripe_topup: boolean;
  enable_stripe_elements_topup: boolean;
  stripe_publishable_key?: string;
  stripe_currency?: string;
  pay_methods: Array<{
    name: string;
    type: string;
    color?: string;
    min_topup?: string;
  }>;
  stripe_min_topup: number;
  amount_options: number[];
  discount: Record<string, number>;
};

type StripePaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
};

type StripePaymentMethodsData = {
  default_payment_method_id: string;
  payment_methods: StripePaymentMethod[];
};

type StripePaymentIntentData = {
  trade_no: string;
  status: string;
  client_secret?: string;
};

type StripeSetupIntentData = {
  client_secret: string;
};

type StripeAutoTopupData = {
  enabled: boolean;
  threshold: number;
  amount: number;
  payment_method_id: string;
};

type RewardStatusData = {
  eligible: boolean;
  pending: boolean;
  claimed: boolean;
  signup_quota: number;
  invitee_quota: number;
  inviter_aff_quota: number;
  total_quota: number;
  stripe_preauth_amount: number;
  stripe_currency: string;
  payment_intent_id?: string;
  payment_intent_status?: string;
  void_after?: number;
  voided_time?: number;
};

type RewardClaimData = {
  claim_status: string;
  granted_quota?: number;
  signup_quota?: number;
  invitee_quota?: number;
  inviter_aff_quota?: number;
  payment_intent_id?: string;
  payment_intent_status?: string;
  client_secret?: string;
  void_after?: number;
};

type CreditGrantRow = {
  id: number;
  user_id: number;
  grant_type: string;
  quota: number;
  used_quota: number;
  created_time: number;
  expired_time: number;
  reference: string;
  remark: string;
  created_by: number;
};

type PageInfo<T> = { page: number; page_size: number; total: number; items: T };

function normalizeCreditGrantsError(message: string): string {
  if (!message) return "";
  if (message.includes('parsing "credit_grants"')) {
    return "Server does not support credit grants yet. Please update the backend.";
  }
  return message;
}

function BindCardForm({
  saving,
  onSubmit,
}: {
  saving: boolean;
  onSubmit: (args: { stripe: any; elements: any }) => void | Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-3">
        <PaymentElement />
      </div>
      <Button
        fullWidth
        onPress={() => {
          if (!stripe || !elements) return;
          onSubmit({ stripe, elements });
        }}
        isDisabled={!stripe || !elements || saving}
      >
        {saving ? <Spinner size="sm" /> : null}
        Save card
      </Button>
    </div>
  );
}

function BindCardModal({
  isOpen,
  onClose,
  stripePromise,
  onBound,
}: {
  isOpen: boolean;
  onClose: () => void;
  stripePromise: ReturnType<typeof loadStripe> | null;
  onBound: (paymentMethodId?: string) => void;
}) {
  const { resolvedTheme } = useContext(ThemeContext);
  const [clientSecret, setClientSecret] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const elementsAppearance = useMemo<Appearance>(() => {
    return { theme: resolvedTheme === "dark" ? "night" : "stripe" };
  }, [resolvedTheme]);

  useEffect(() => {
    if (!isOpen) return;
    if (!stripePromise) return;
    setLoading(true);
    fetchJson<ApiResponse<StripeSetupIntentData>>(
      "/api/user/stripe/setup_intent",
      {
        method: "POST",
      },
    )
      .then((res) => setClientSecret(res.data.client_secret))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, stripePromise]);

  const submit = async ({
    stripe,
    elements,
  }: {
    stripe: any;
    elements: any;
  }) => {
    setSaving(true);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        toast.error(submitError.message || "Card validation failed");
        return;
      }

      const result = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
        confirmParams: { return_url: window.location.href },
      });
      if (result?.error) {
        toast.error(result.error.message || "Failed to bind card");
        return;
      }

      const pm = result?.setupIntent?.payment_method;
      toast.success("Card saved");
      onBound(typeof pm === "string" ? pm : undefined);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Button className="sr-only" variant="ghost">
        Open
      </Button>
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog className="sm:max-w-[560px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Bind card</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {loading ? (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              ) : null}
              {!loading && stripePromise && clientSecret ? (
                <Elements
                  key={resolvedTheme}
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    appearance: elementsAppearance,
                  }}
                >
                  <BindCardForm saving={saving} onSubmit={submit} />
                </Elements>
              ) : null}
              {!loading && !clientSecret ? (
                <div className="text-sm text-muted">
                  Failed to start card setup.
                </div>
              ) : null}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export function TopUpPage() {
  const { user, refreshSelf } = useAuth();
  const { status } = useStatus();
  const navigate = useNavigate();

  const quotaPerUnit = status?.quota_per_unit || 500000;
  const displayQuota = ((user?.quota ?? 0) / quotaPerUnit).toFixed(2);
  const displayUsedQuota = ((user?.used_quota ?? 0) / quotaPerUnit).toFixed(2);
  const displayAffQuota = ((user?.aff_quota ?? 0) / quotaPerUnit).toFixed(2);
  const displayAffHistoryQuota = (
    (user?.aff_history_quota ?? 0) / quotaPerUnit
  ).toFixed(2);

  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const [creditGrants, setCreditGrants] = useState<CreditGrantRow[]>([]);
  const [creditGrantsPage, setCreditGrantsPage] = useState(1);
  const [creditGrantsTotal, setCreditGrantsTotal] = useState(0);
  const [creditGrantsPageSize] = useState(20);
  const [creditGrantsLoading, setCreditGrantsLoading] = useState(false);
  const [creditGrantsError, setCreditGrantsError] = useState("");

  const [info, setInfo] = useState<TopUpInfo | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [stripePreview, setStripePreview] = useState<string>("");
  const [paying, setPaying] = useState(false);

  const stripeEnabled = Boolean(info?.enable_stripe_elements_topup);
  const stripePublishableKey = info?.stripe_publishable_key || "";
  const stripePromise = useMemo(() => {
    if (!stripePublishableKey) return null;
    return loadStripe(stripePublishableKey);
  }, [stripePublishableKey]);

  const [bindCardOpen, setBindCardOpen] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<StripePaymentMethod[]>(
    [],
  );
  const [defaultPaymentMethodId, setDefaultPaymentMethodId] = useState("");
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false);
  const [deletingPaymentMethodId, setDeletingPaymentMethodId] = useState("");

  const [rewardStatus, setRewardStatus] = useState<RewardStatusData | null>(
    null,
  );
  const [rewardLoading, setRewardLoading] = useState(false);
  const [rewardClaiming, setRewardClaiming] = useState(false);
  const [rewardClaimAfterBind, setRewardClaimAfterBind] = useState(false);

  const defaultCard = useMemo(
    () => paymentMethods.find((pm) => pm.id === defaultPaymentMethodId) ?? null,
    [paymentMethods, defaultPaymentMethodId],
  );

  const effectivePaymentMethodId =
    selectedPaymentMethodId || defaultPaymentMethodId;
  const selectedCard = useMemo(
    () =>
      paymentMethods.find((pm) => pm.id === effectivePaymentMethodId) ?? null,
    [paymentMethods, effectivePaymentMethodId],
  );

  useEffect(() => {
    if (!selectedPaymentMethodId) return;
    if (paymentMethods.some((pm) => pm.id === selectedPaymentMethodId)) return;
    setSelectedPaymentMethodId("");
  }, [paymentMethods, selectedPaymentMethodId]);

  const [autoTopup, setAutoTopup] = useState<StripeAutoTopupData>({
    enabled: false,
    threshold: 0,
    amount: 0,
    payment_method_id: "",
  });
  const [autoTopupSaving, setAutoTopupSaving] = useState(false);

  const [affCode, setAffCode] = useState<string>("");
  const affLink = useMemo(() => {
    if (!affCode) return "";
    return `${window.location.origin}/auth/signup?via=${encodeURIComponent(affCode)}`;
  }, [affCode]);

  const [transferQuota, setTransferQuota] = useState<number>(0);

  const loadCreditGrants = async (page = creditGrantsPage) => {
    setCreditGrantsError("");
    setCreditGrantsLoading(true);
    try {
      try {
        const res = await fetchJson<ApiResponse<PageInfo<CreditGrantRow[]>>>(
          "/api/user/credit_grants",
          {
            params: { p: page, page_size: creditGrantsPageSize },
            skipErrorHandler: true,
          },
        );
        setCreditGrants((res.data.items || []) as any);
        setCreditGrantsTotal(res.data.total || 0);
        setCreditGrantsPage(res.data.page || page);
      } catch (error) {
        const message = normalizeCreditGrantsError(
          error instanceof Error ? error.message : String(error),
        );
        // Backward compatibility: older servers don't have /api/user/credit_grants (they only have the admin route).
        if (user?.role && user.role >= 10 && user.id) {
          try {
            const res = await fetchJson<
              ApiResponse<PageInfo<CreditGrantRow[]>>
            >(`/api/user/${user.id}/credit_grants`, {
              params: { p: page, page_size: creditGrantsPageSize },
              skipErrorHandler: true,
            });
            setCreditGrants((res.data.items || []) as any);
            setCreditGrantsTotal(res.data.total || 0);
            setCreditGrantsPage(res.data.page || page);
          } catch (fallbackError) {
            const fallbackMessage =
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError);
            setCreditGrantsError(
              normalizeCreditGrantsError(
                fallbackMessage || message || "Failed to load credit grants.",
              ),
            );
          }
        } else {
          setCreditGrantsError(message || "Failed to load credit grants.");
        }
      }
    } finally {
      setCreditGrantsLoading(false);
    }
  };

  useEffect(() => {
    fetchJson<ApiResponse<TopUpInfo>>("/api/user/topup/info")
      .then((res) => {
        setInfo(res.data);
        const first = res.data.amount_options?.[0];
        if (typeof first === "number") setAmount(first);
      })
      .catch(() => {});

    fetchJson<ApiResponse<string>>("/api/user/aff")
      .then((res) => setAffCode(res.data || ""))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    loadCreditGrants(1).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadRewardStatus = async () => {
    setRewardLoading(true);
    try {
      const res = await fetchJson<ApiResponse<RewardStatusData>>(
        "/api/user/reward/status",
      );
      setRewardStatus(res.data);
    } finally {
      setRewardLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    loadRewardStatus().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadStripePaymentMethods = async () => {
    if (!stripeEnabled) return;
    setPaymentMethodsLoading(true);
    try {
      const res = await fetchJson<ApiResponse<StripePaymentMethodsData>>(
        "/api/user/stripe/payment_methods",
      );
      const methods = res.data.payment_methods || [];
      const nextDefaultId = res.data.default_payment_method_id || "";
      setPaymentMethods(methods);
      setDefaultPaymentMethodId(nextDefaultId);
      setSelectedPaymentMethodId((prev) => {
        if (prev && methods.some((pm) => pm.id === prev)) return prev;
        if (nextDefaultId && methods.some((pm) => pm.id === nextDefaultId))
          return nextDefaultId;
        return methods[0]?.id || "";
      });
    } finally {
      setPaymentMethodsLoading(false);
    }
  };

  const claimReward = async ({
    allowRecursion = true,
  }: { allowRecursion?: boolean } = {}) => {
    if (rewardClaiming) return;
    if (!stripeEnabled) {
      toast.error("Card binding is not enabled.");
      return;
    }

    if (!defaultPaymentMethodId) {
      setRewardClaimAfterBind(true);
      setBindCardOpen(true);
      return;
    }

    setRewardClaiming(true);
    try {
      const res = await fetchJson<ApiResponse<RewardClaimData>>(
        "/api/user/reward/claim",
        {
          method: "POST",
        },
      );

      if (res.data.claim_status === "no_reward") {
        toast.info("No reward available");
        await loadRewardStatus();
        return;
      }

      if (res.data.claim_status === "claimed") {
        const granted = res.data.granted_quota || 0;
        const dollars = granted > 0 ? (granted / quotaPerUnit).toFixed(2) : "";
        toast.success(
          dollars ? `Reward claimed: $${dollars}` : "Reward claimed",
        );
        await refreshSelf();
        loadCreditGrants(1).catch(() => {});
        await loadRewardStatus();
        return;
      }

      if (
        res.data.claim_status === "requires_action" &&
        res.data.client_secret &&
        stripePromise
      ) {
        const stripe = await stripePromise;
        if (!stripe) {
          toast.error("Stripe is not available");
          return;
        }
        const confirmed = await stripe.confirmCardPayment(
          res.data.client_secret,
        );
        if (confirmed.error) {
          toast.error(confirmed.error.message || "Verification failed");
          return;
        }

        if (allowRecursion) {
          await claimReward({ allowRecursion: false });
        } else {
          toast.success("Verified");
          await loadRewardStatus();
        }
        return;
      }

      toast.error(`Reward claim status: ${res.data.claim_status}`);
      await loadRewardStatus();
    } finally {
      setRewardClaiming(false);
    }
  };

  const loadStripeAutoTopup = async () => {
    if (!stripeEnabled) return;
    const res = await fetchJson<ApiResponse<StripeAutoTopupData>>(
      "/api/user/stripe/auto_topup",
    );
    setAutoTopup(res.data);
  };

  useEffect(() => {
    if (!stripeEnabled) return;
    loadStripePaymentMethods().catch(() => {});
    loadStripeAutoTopup().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripeEnabled]);

  useEffect(() => {
    if (!rewardClaimAfterBind) return;
    if (!defaultPaymentMethodId) return;
    setRewardClaimAfterBind(false);
    claimReward().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewardClaimAfterBind, defaultPaymentMethodId]);

  const redeem = async () => {
    if (!redeemCode.trim()) {
      toast.warning("Please enter a redeem code.");
      return;
    }
    setRedeeming(true);
    try {
      const res = await fetchJson<ApiResponse<number>>("/api/user/topup", {
        method: "POST",
        body: { key: redeemCode.trim() },
      });
      const addedAmount = ((res.data || 0) / quotaPerUnit).toFixed(2);
      toast.success(`Added quota: $${addedAmount}`);
      setRedeemCode("");
      await refreshSelf();
      loadCreditGrants(1).catch(() => {});
    } finally {
      setRedeeming(false);
    }
  };

  const estimateStripe = async () => {
    if (!amount || amount <= 0) return;
    const res = await fetchJson<PaymentResponse>("/api/user/stripe/amount", {
      method: "POST",
      body: { amount },
    });
    if (res.message === "success") {
      setStripePreview(String(res.data));
    } else {
      toast.error(String(res.data));
    }
  };

  useEffect(() => {
    if (!stripeEnabled) return;
    estimateStripe().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, stripeEnabled]);

  const payStripe = async () => {
    if (!stripeEnabled) return;
    if (!amount || amount <= 0) {
      toast.warning("Please choose an amount.");
      return;
    }
    const paymentMethodId = selectedPaymentMethodId || defaultPaymentMethodId;
    if (!paymentMethodId) {
      toast.warning("Please bind a card first.");
      return;
    }
    setPaying(true);
    try {
      const res = await fetchJson<ApiResponse<StripePaymentIntentData>>(
        "/api/user/stripe/payment_intent",
        {
          method: "POST",
          body: { amount, payment_method_id: paymentMethodId },
        },
      );

      if (res.data.status === "succeeded") {
        toast.success("Paid");
        await refreshSelf();
        loadCreditGrants(1).catch(() => {});
        return;
      }

      if (
        res.data.status === "requires_action" &&
        res.data.client_secret &&
        stripePromise
      ) {
        const stripe = await stripePromise;
        if (!stripe) {
          toast.error("Stripe is not available");
          return;
        }
        const confirmed = await stripe.confirmCardPayment(
          res.data.client_secret,
        );
        if (confirmed.error) {
          toast.error(confirmed.error.message || "Payment confirmation failed");
          return;
        }
        toast.success("Payment confirmed");
        // Balance will be updated by webhook; refresh after a short delay.
        setTimeout(() => {
          refreshSelf().catch(() => {});
          loadCreditGrants(1).catch(() => {});
        }, 1200);
        return;
      }

      toast.error(`Payment status: ${res.data.status}`);
    } finally {
      setPaying(false);
    }
  };

  const setDefaultCard = async (paymentMethodId: string) => {
    await fetchJson<ApiResponse<any>>(
      "/api/user/stripe/payment_methods/default",
      {
        method: "PUT",
        body: { payment_method_id: paymentMethodId },
      },
    );
    toast.success("Default card updated");
    setSelectedPaymentMethodId(paymentMethodId);
    await loadStripePaymentMethods();
  };

  const deleteCard = async (paymentMethodId: string) => {
    if (!stripeEnabled) return;
    const pm = paymentMethods.find((method) => method.id === paymentMethodId);
    const label = pm
      ? `${pm.brand?.toUpperCase?.() || pm.brand} •••• ${pm.last4}`
      : paymentMethodId;

    const ok = await confirmModal(
      `Delete card ${label}? This cannot be undone.`,
      {
        title: "Delete card",
        confirmText: "Delete",
        confirmVariant: "danger",
      },
    );
    if (!ok) return;

    setDeletingPaymentMethodId(paymentMethodId);
    try {
      await fetchJson<ApiResponse<any>>(
        `/api/user/stripe/payment_methods/${paymentMethodId}`,
        {
          method: "DELETE",
        },
      );
      toast.success("Card deleted");
      await loadStripePaymentMethods();
      await loadStripeAutoTopup();
    } finally {
      setDeletingPaymentMethodId("");
    }
  };

  const saveAutoTopup = async () => {
    if (!stripeEnabled) return;
    if (autoTopup.enabled) {
      if (!autoTopup.threshold || autoTopup.threshold <= 0) {
        toast.warning("Please set a threshold.");
        return;
      }
      if (!autoTopup.amount || autoTopup.amount <= 0) {
        toast.warning("Please set a top-up amount.");
        return;
      }
      if (!defaultPaymentMethodId) {
        toast.warning("Please set a default card.");
        return;
      }
    }

    setAutoTopupSaving(true);
    try {
      await fetchJson<ApiResponse<any>>("/api/user/stripe/auto_topup", {
        method: "PUT",
        body: {
          enabled: autoTopup.enabled,
          threshold: Number(autoTopup.threshold),
          amount: Number(autoTopup.amount),
          payment_method_id: defaultPaymentMethodId,
        },
      });
      toast.success("Saved");
      await loadStripeAutoTopup();
    } finally {
      setAutoTopupSaving(false);
    }
  };

  const doTransfer = async () => {
    if (!transferQuota || transferQuota <= 0) {
      toast.warning("Please enter a quota to transfer.");
      return;
    }
    const actualQuota = Math.round(transferQuota * quotaPerUnit);
    await fetchJson<ApiResponse<any>>("/api/user/aff_transfer", {
      method: "POST",
      body: { quota: actualQuota },
    });
    toast.success("Transferred");
    setTransferQuota(0);
    await refreshSelf();
    loadCreditGrants(1).catch(() => {});
  };

  const formatDollarsFromQuota = (quota: number) =>
    ((quota || 0) / quotaPerUnit).toFixed(2);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-lg font-semibold">Billing</div>
        <Button
          variant="secondary"
          onPress={() => navigate("/billing/invoices")}
        >
          Invoices
        </Button>
      </div>

      <Card variant="secondary">
        <Card.Content>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <div className="text-sm text-muted">Current balance</div>
              <div className="mt-1 text-2xl font-semibold">${displayQuota}</div>
            </div>
            <div>
              <div className="text-sm text-muted">Used</div>
              <div className="mt-1 text-2xl font-semibold">
                ${displayUsedQuota}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted">Request count</div>
              <div className="mt-1 text-2xl font-semibold">
                {user?.request_count ?? 0}
              </div>
            </div>
          </div>
        </Card.Content>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <Card.Header>
              <Card.Title>Online top-up</Card.Title>
            </Card.Header>
            <Card.Content>
              {stripeEnabled ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-muted">Saved card</div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onPress={() =>
                          loadStripePaymentMethods().catch(() => {})
                        }
                      >
                        Refresh
                      </Button>
                      <Button size="sm" onPress={() => setBindCardOpen(true)}>
                        Bind card
                      </Button>
                    </div>
                  </div>

                  <div className="mt-2 space-y-2">
                    {paymentMethodsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <Spinner size="sm" />
                        Loading cards…
                      </div>
                    ) : null}
                    {!paymentMethodsLoading && paymentMethods.length === 0 ? (
                      <div className="text-sm text-muted">
                        No card saved yet.
                      </div>
                    ) : null}

                    {!paymentMethodsLoading && paymentMethods.length > 0 ? (
                      <div className="space-y-2">
                        {paymentMethods.map((pm) => {
                          const isDefault = pm.id === defaultPaymentMethodId;
                          const isSelected = pm.id === effectivePaymentMethodId;
                          const deleting = deletingPaymentMethodId === pm.id;

                          return (
                            <div
                              key={pm.id}
                              className={`w-full rounded-lg border p-3 text-sm transition ${
                                isSelected
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:bg-muted/30"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 text-left"
                                  onClick={() =>
                                    setSelectedPaymentMethodId(pm.id)
                                  }
                                  disabled={paying || deleting}
                                >
                                  <div className="flex items-start gap-3">
                                    <div
                                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                                        isSelected
                                          ? "border-primary bg-primary/15 text-primary"
                                          : "border-border bg-muted/20 text-muted"
                                      }`}
                                      aria-hidden="true"
                                    >
                                      <Check
                                        size={14}
                                        className={`transition-opacity ${isSelected ? "opacity-100" : "opacity-0"}`}
                                      />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <div className="font-medium">
                                          {pm.brand?.toUpperCase?.() ||
                                            pm.brand}{" "}
                                          •••• {pm.last4}
                                        </div>
                                        {isDefault ? (
                                          <span className="text-xs text-primary">
                                            Default
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="mt-1 text-xs text-muted">
                                        Expires {pm.exp_month}/{pm.exp_year}
                                      </div>
                                    </div>
                                  </div>
                                </button>

                                <div className="flex shrink-0 items-center gap-2">
                                  {!isDefault ? (
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onPress={() =>
                                        setDefaultCard(pm.id).catch(() => {})
                                      }
                                      isDisabled={paying || deleting}
                                    >
                                      Set default
                                    </Button>
                                  ) : null}
                                  <Button
                                    isIconOnly
                                    aria-label={`Delete card ${pm.brand?.toUpperCase?.() || pm.brand} •••• ${pm.last4}`}
                                    variant="danger-soft"
                                    size="sm"
                                    onPress={() =>
                                      deleteCard(pm.id).catch(() => {})
                                    }
                                    isDisabled={paying || deleting}
                                  >
                                    {deleting ? (
                                      <Spinner size="sm" />
                                    ) : (
                                      <Trash2 size={16} />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(info?.amount_options || []).map((opt) => (
                      <Button
                        key={opt}
                        size="sm"
                        variant={opt === amount ? "primary" : "secondary"}
                        onPress={() => setAmount(opt)}
                      >
                        {opt}
                      </Button>
                    ))}
                  </div>

                  <div className="mt-3 flex items-end gap-2">
                    <TextField
                      fullWidth
                      name="amount"
                      type="number"
                      onChange={(value) => setAmount(Number(value))}
                    >
                      <Label>Amount</Label>
                      <Input
                        value={String(amount)}
                        min={info?.stripe_min_topup || 0}
                      />
                    </TextField>
                    <Button
                      variant="secondary"
                      onPress={() => estimateStripe().catch(() => {})}
                    >
                      Estimate
                    </Button>
                  </div>

                  <div className="mt-2 text-sm text-muted">
                    Payable: {stripePreview ? stripePreview : "—"}
                  </div>
                  {effectivePaymentMethodId && paymentMethods.length > 0 ? (
                    <div className="mt-1 text-xs text-muted">
                      Paying with:{" "}
                      {selectedCard
                        ? `${selectedCard.brand?.toUpperCase?.() || selectedCard.brand} •••• ${selectedCard.last4}`
                        : effectivePaymentMethodId}
                    </div>
                  ) : null}
                  <Button fullWidth onPress={payStripe} isDisabled={paying}>
                    {paying ? <Spinner size="sm" /> : null}
                    Pay
                  </Button>
                </>
              ) : (
                <div className="text-sm text-muted">
                  Stripe Elements top-up is not available.
                </div>
              )}
            </Card.Content>
          </Card>

          <Card>
            <Card.Header>
              <Card.Title>Auto top-up</Card.Title>
            </Card.Header>
            <Card.Content>
              {stripeEnabled ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="stripe-auto-topup-enabled"
                      isSelected={autoTopup.enabled}
                      onChange={(isSelected) =>
                        setAutoTopup((prev) => ({
                          ...prev,
                          enabled: isSelected,
                          payment_method_id: defaultPaymentMethodId,
                          amount: prev.amount || amount,
                          threshold:
                            prev.threshold || Math.max(1, Number(amount) - 1),
                        }))
                      }
                    >
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox>
                    <Label htmlFor="stripe-auto-topup-enabled">
                      Enable auto top-up
                    </Label>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <TextField
                      name="autoTopupThreshold"
                      type="number"
                      onChange={(value) =>
                        setAutoTopup((prev) => ({
                          ...prev,
                          threshold: Number(value),
                        }))
                      }
                      isDisabled={!autoTopup.enabled}
                    >
                      <Label>When balance below</Label>
                      <Input
                        min={0}
                        value={String(autoTopup.threshold || "")}
                      />
                    </TextField>
                    <TextField
                      name="autoTopupAmount"
                      type="number"
                      onChange={(value) =>
                        setAutoTopup((prev) => ({
                          ...prev,
                          amount: Number(value),
                        }))
                      }
                      isDisabled={!autoTopup.enabled}
                    >
                      <Label>Top up amount</Label>
                      <Input
                        min={info?.stripe_min_topup || 0}
                        value={String(autoTopup.amount || "")}
                      />
                    </TextField>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm text-muted">Charge card</div>
                    {!defaultPaymentMethodId ? (
                      <div className="text-sm text-muted">
                        Set a default card to enable auto top-up.
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border p-3 text-sm">
                        <div className="font-medium">
                          {defaultCard
                            ? `${defaultCard.brand?.toUpperCase?.() || defaultCard.brand} •••• ${defaultCard.last4}`
                            : defaultPaymentMethodId}
                        </div>
                        {defaultCard ? (
                          <div className="mt-1 text-xs text-muted">
                            Expires {defaultCard.exp_month}/
                            {defaultCard.exp_year}
                          </div>
                        ) : null}
                        <div className="mt-1 text-xs text-muted">
                          Auto top-up always charges your default card. Change
                          the default card above to update it.
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    onPress={() => saveAutoTopup().catch(() => {})}
                    isDisabled={autoTopupSaving}
                  >
                    {autoTopupSaving ? <Spinner size="sm" /> : null}
                    Save
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-muted">
                  Auto top-up is not available.
                </div>
              )}
            </Card.Content>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <Card.Header>
              <Card.Title>Redeem code</Card.Title>
            </Card.Header>
            <Card.Content>
              <div className="flex items-end gap-2">
                <TextField
                  fullWidth
                  name="redeemCode"
                  onChange={setRedeemCode}
                >
                  <Label className="sr-only">Redeem code</Label>
                  <Input value={redeemCode} placeholder="Enter redeem code" />
                </TextField>
                <Button onPress={redeem} isDisabled={redeeming}>
                  Redeem
                </Button>
              </div>
            </Card.Content>
          </Card>

          <Card>
            <Card.Header>
              <Card.Title>Invitation</Card.Title>
            </Card.Header>
            <Card.Content className="space-y-3">
              <div className="flex items-end gap-2">
                <TextField fullWidth name="affLink" isReadOnly>
                  <Label>Invite link</Label>
                  <Input readOnly value={affLink} />
                </TextField>
                <Button
                  variant="secondary"
                  onPress={() =>
                    copyText(affLink).then((ok) =>
                      ok ? toast.success("Copied") : toast.error("Copy failed"),
                    )
                  }
                  isDisabled={!affLink}
                >
                  Copy
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
                <div>Aff quota: ${displayAffQuota}</div>
                <div>Aff history: ${displayAffHistoryQuota}</div>
                <div>Invites: {user?.aff_count ?? "—"}</div>
              </div>

              {rewardStatus?.eligible ? (
                <div className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="font-medium">Registration reward</div>
                      {rewardStatus.claimed ? (
                        <div className="text-muted">Already claimed.</div>
                      ) : rewardStatus.pending ? (
                        <div className="text-muted">
                          Available: $
                          {formatDollarsFromQuota(
                            rewardStatus.total_quota || 0,
                          )}
                          . Bind a card to place a $1 authorization (voided in
                          24 hours) and claim.
                        </div>
                      ) : (
                        <div className="text-muted">Not available.</div>
                      )}
                      {rewardStatus.pending &&
                      rewardStatus.payment_intent_status ===
                        "requires_action" ? (
                        <div className="text-xs text-muted">
                          Verification requires action. Click Claim to continue.
                        </div>
                      ) : null}
                      {rewardStatus.pending && rewardStatus.void_after ? (
                        <div className="text-xs text-muted">
                          Authorization void after:{" "}
                          {formatUnixSeconds(rewardStatus.void_after)}
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0">
                      {rewardStatus.claimed ? null : rewardStatus.pending ? (
                        <Button
                          onPress={() => claimReward().catch(() => {})}
                          isDisabled={rewardClaiming || rewardLoading}
                        >
                          {rewardClaiming ? <Spinner size="sm" /> : null}
                          {defaultPaymentMethodId ? "Claim" : "Bind & Claim"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex items-end gap-2">
                <TextField
                  fullWidth
                  name="transferQuota"
                  type="number"
                  onChange={(value) => setTransferQuota(Number(value))}
                >
                  <Label>Transfer quota ($)</Label>
                  <Input min={0} step="0.01" value={String(transferQuota)} />
                </TextField>
                <Button onPress={() => doTransfer().catch(() => {})}>
                  Transfer
                </Button>
              </div>
            </Card.Content>
          </Card>
        </div>
      </div>

      <Card>
        <Card.Header>
          <div className="flex items-center justify-between gap-2">
            <Card.Title>Credit grants</Card.Title>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => loadCreditGrants(creditGrantsPage).catch(() => {})}
            >
              Refresh
            </Button>
          </div>
        </Card.Header>
        <Card.Content className="space-y-3">
          {creditGrantsLoading && creditGrants.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner size="sm" />
              Loading credit grants…
            </div>
          ) : null}

          {creditGrantsError ? (
            <div className="text-sm text-muted">
              Failed to load credit grants: {creditGrantsError}
            </div>
          ) : null}

          {!creditGrantsLoading && creditGrants.length === 0 ? (
            <div className="text-sm text-muted">No credit grants yet.</div>
          ) : null}

          {creditGrants.length > 0 ? (
            <div className="space-y-2">
              {creditGrants.map((grant) => {
                const totalQuota = grant.quota || 0;
                const usedQuota = grant.used_quota || 0;
                const remainingQuota = Math.max(0, totalQuota - usedQuota);

                const createdAt = formatUnixSeconds(grant.created_time);
                const expiresAt = grant.expired_time
                  ? formatUnixSeconds(grant.expired_time)
                  : "Never";

                return (
                  <div
                    key={grant.id}
                    className="rounded-lg border border-border p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium">#{grant.id}</div>
                          <div className="text-muted">·</div>
                          <div className="font-medium">
                            {grant.grant_type || "—"}
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          Created: {createdAt} · Expires: {expiresAt}
                        </div>
                        {grant.remark ? (
                          <div className="mt-1 text-xs text-muted">
                            Remark: {grant.remark}
                          </div>
                        ) : null}
                        {grant.reference ? (
                          <div className="mt-1 text-xs text-muted">
                            Ref:{" "}
                            <span className="break-all font-mono">
                              {grant.reference}
                            </span>
                          </div>
                        ) : null}
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-base font-semibold">
                          ${formatDollarsFromQuota(remainingQuota)}
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          Used ${formatDollarsFromQuota(usedQuota)} / Total $
                          {formatDollarsFromQuota(totalQuota)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="flex items-center justify-between text-sm text-muted">
            <div>
              {creditGrantsLoading ? "Loading…" : `Total ${creditGrantsTotal}`}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                isDisabled={creditGrantsPage <= 1 || creditGrantsLoading}
                onPress={() =>
                  loadCreditGrants(creditGrantsPage - 1).catch(() => {})
                }
              >
                Prev
              </Button>
              <span>Page {creditGrantsPage}</span>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={
                  creditGrantsPage * creditGrantsPageSize >=
                    creditGrantsTotal || creditGrantsLoading
                }
                onPress={() =>
                  loadCreditGrants(creditGrantsPage + 1).catch(() => {})
                }
              >
                Next
              </Button>
            </div>
          </div>
        </Card.Content>
      </Card>

      <BindCardModal
        isOpen={bindCardOpen}
        onClose={() => setBindCardOpen(false)}
        stripePromise={stripePromise}
        onBound={(pmId) => {
          loadStripePaymentMethods().catch(() => {});
          if (pmId) {
            setDefaultCard(pmId).catch(() => {});
          }
        }}
      />
    </div>
  );
}
