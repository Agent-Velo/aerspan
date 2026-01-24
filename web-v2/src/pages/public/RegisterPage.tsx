import { useMemo, useState } from "react";
import Turnstile from "react-turnstile";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { fetchJson } from "@/api/client";
import type { ApiResponse } from "@/api/types";
import { toast } from "@/ui/toast";
import { useStatus } from "@/stores/status/StatusStore";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  TextField,
} from "@/components/ui/heroui";

function getInviteCode(): string | null {
  const raw = localStorage.getItem("via") || localStorage.getItem("aff");
  return raw && raw.trim() ? raw.trim() : null;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { status } = useStatus();

  const [email, setEmail] = useState("");

  const [turnstileToken, setTurnstileToken] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const selfUseMode = Boolean(status?.self_use_mode_enabled);

  const turnstileEnabled = Boolean(status?.turnstile_check);
  const turnstileSiteKey =
    (status?.turnstile_site_key as string | undefined) || "";

  const needsTerms = Boolean(
    status?.user_agreement_enabled || status?.privacy_policy_enabled,
  );

  const canSubmit = useMemo(() => {
    if (selfUseMode) return false;

    if (!email.trim()) return false;

    if (turnstileEnabled && !turnstileToken) return false;
    if (needsTerms && !termsAccepted) return false;
    return true;
  }, [
    selfUseMode,
    email,
    turnstileEnabled,
    turnstileToken,
    needsTerms,
    termsAccepted,
  ]);

  const ensureTurnstile = () => {
    if (!turnstileEnabled) return true;
    if (turnstileToken) return true;
    toast.info("Please complete Turnstile verification.");
    return false;
  };

  const ensureTerms = () => {
    if (!needsTerms) return true;
    if (termsAccepted) return true;
    toast.warning("Please accept the Terms and Privacy Policy.");
    return false;
  };

  const sendMagicLinkRegister = async () => {
    if (selfUseMode) return;
    if (!ensureTerms()) return;
    if (!ensureTurnstile()) return;
    if (!email.trim()) {
      toast.warning("Please enter your email.");
      return;
    }
    setSubmitting(true);
    try {
      const aff = getInviteCode();
      await fetchJson<ApiResponse<any>>("/api/user/magic_link", {
        params: {
          email: email.trim(),
          action: "register",
          via: aff || undefined,
          redirect: "/dashboard",
          turnstile: turnstileEnabled ? turnstileToken : undefined,
        },
      });
      setMagicLinkSent(true);
      toast.success("Magic link sent.");
    } finally {
      setSubmitting(false);
    }
  };

  if (selfUseMode) {
    return (
      <div className="w-full max-w-md">
        <Card>
          <Card.Header>
            <Card.Title>Registration is disabled</Card.Title>
            <Card.Description>
              This service is running in self-use mode.
            </Card.Description>
          </Card.Header>
          <Card.Footer>
            <Button onPress={() => navigate("/auth/signin")}>
              Go to login
            </Button>
          </Card.Footer>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg pb-4 flex flex-col items-center">
      <div className="pb-8">
        <h1 className="text-3xl font-semibold">Sign up for Aerspan</h1>
      </div>

      <Card className="pt-6 w-md">
        <Card.Content className="space-y-4 mr-4.5 ml-4.5">
          {magicLinkSent ? (
            <Alert status="success">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>
                  Magic link sent. Check your inbox to finish signing up.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}

          <TextField
            fullWidth
            name="email"
            type="email"
            onChange={(next) => {
              setEmail(next);
              setMagicLinkSent(false);
            }}
          >
            <Label>Email</Label>
            <Input value={email} autoComplete="email" />
          </TextField>

          {turnstileEnabled && turnstileSiteKey ? (
            <Turnstile
              sitekey={turnstileSiteKey}
              onVerify={setTurnstileToken}
            />
          ) : null}

          {needsTerms ? (
            <Checkbox
              id="register-terms"
              isSelected={termsAccepted}
              onChange={setTermsAccepted}
            >
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label htmlFor="register-terms">
                  I agree to the <RouterLink to="/terms">Terms</RouterLink> and{" "}
                  <RouterLink to="/privacy-policy">Privacy Policy</RouterLink>.
                </Label>
              </Checkbox.Content>
            </Checkbox>
          ) : null}

          <Button
            className="w-full"
            onPress={sendMagicLinkRegister}
            isDisabled={!canSubmit || submitting}
          >
            Continue
          </Button>
        </Card.Content>

        <Card.Footer className="mr-4.5 ml-4.5 mt-6 mb-1 text-center">
          <div className="text-sm text-muted w-full text-center">
            Already have an account?{" "}
            <RouterLink to="/auth/signin">Sign in</RouterLink>
          </div>
        </Card.Footer>
      </Card>
    </div>
  );
}
