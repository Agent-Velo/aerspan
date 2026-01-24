import { useMemo, useState } from "react";
import Turnstile from "react-turnstile";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { fetchJson } from "@/api/client";
import type { ApiResponse, UserBase } from "@/api/types";
import { SocialLoginOptions } from "@/components/auth/SocialLoginOptions";
import { toast } from "@/ui/toast";
import { useAuth } from "@/stores/auth/AuthStore";
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

type LoginResponse =
  | ApiResponse<UserBase>
  | ApiResponse<{
      require_2fa: true;
    }>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { status } = useStatus();

  const [method, setMethod] = useState<"magic" | "password">("magic");
  const [magicEmail, setMagicEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");

  const [turnstileToken, setTurnstileToken] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [step, setStep] = useState<"password" | "2fa">("password");
  const [submitting, setSubmitting] = useState(false);

  const turnstileEnabled = Boolean(status?.turnstile_check);
  const turnstileSiteKey =
    (status?.turnstile_site_key as string | undefined) || "";

  const needsTerms = Boolean(
    status?.user_agreement_enabled || status?.privacy_policy_enabled,
  );

  const redirectTo = useMemo(() => {
    const from = (location.state as any)?.from?.pathname as string | undefined;
    return from || "/dashboard";
  }, [location.state]);

  const ensureTerms = () => {
    if (!needsTerms) return true;
    if (termsAccepted) return true;
    toast.warning("Please accept the Terms and Privacy Policy.");
    return false;
  };

  const ensureTurnstile = () => {
    if (!turnstileEnabled) return true;
    if (turnstileToken) return true;
    toast.info("Please complete Turnstile verification.");
    return false;
  };

  const completeLogin = (user: UserBase) => {
    login(user);
    navigate(redirectTo, { replace: true });
  };

  const sendMagicLinkLogin = async () => {
    if (!ensureTerms()) return;
    if (!ensureTurnstile()) return;
    if (!magicEmail.trim()) {
      toast.warning("Please enter your email.");
      return;
    }
    setSubmitting(true);
    try {
      await fetchJson<ApiResponse<any>>("/api/user/magic_link", {
        params: {
          email: magicEmail.trim(),
          action: "login",
          redirect: redirectTo,
          turnstile: turnstileEnabled ? turnstileToken : undefined,
        },
      });
      setMagicLinkSent(true);
      toast.success("If the account exists, a magic link has been sent.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordLogin = async () => {
    if (!ensureTerms()) return;
    if (!ensureTurnstile()) return;
    if (!username.trim() || !password) {
      toast.warning("Please enter username/email and password.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchJson<LoginResponse>("/api/user/login", {
        method: "POST",
        params: turnstileEnabled ? { turnstile: turnstileToken } : undefined,
        body: { username: username.trim(), password },
      });

      if ((res.data as any)?.require_2fa) {
        setStep("2fa");
        toast.info("2FA required.");
        return;
      }

      completeLogin(res.data as UserBase);
    } finally {
      setSubmitting(false);
    }
  };

  const handle2faLogin = async () => {
    if (!ensureTerms()) return;
    if (!twoFactorCode.trim()) {
      toast.warning("Please enter your 2FA code.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchJson<ApiResponse<UserBase>>(
        "/api/user/login/2fa",
        {
          method: "POST",
          body: { code: twoFactorCode.trim() },
        },
      );
      completeLogin(res.data);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-lg pb-4 flex flex-col items-center">
      <div className="pb-8">
        <h1 className="text-3xl font-semibold">Sign in</h1>
      </div>
      <Card className="pt-6 w-md">
        <Card.Content className="space-y-4 mr-4.5 ml-4.5">
          {method === "magic" ? (
            <>
              {magicLinkSent ? (
                <Alert status="success">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>
                      Check your inbox for a sign-in link.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}

              <TextField
                fullWidth
                name="email"
                type="email"
                onChange={(next) => {
                  setMagicEmail(next);
                  setMagicLinkSent(false);
                }}
              >
                <Label>Email</Label>
                <Input value={magicEmail} autoComplete="email" />
              </TextField>
            </>
          ) : step === "password" ? (
            <>
              <TextField fullWidth name="username" onChange={setUsername}>
                <Label>Username / Email</Label>
                <Input value={username} autoComplete="username" />
              </TextField>
              <TextField
                fullWidth
                name="password"
                type="password"
                onChange={setPassword}
              >
                <Label>Password</Label>
                <Input value={password} autoComplete="current-password" />
              </TextField>
            </>
          ) : (
            <TextField
              fullWidth
              name="twoFactorCode"
              onChange={setTwoFactorCode}
            >
              <Label>2FA code</Label>
              <Input
                value={twoFactorCode}
                placeholder="6-digit code or backup code"
                autoComplete="one-time-code"
              />
            </TextField>
          )}

          {turnstileEnabled && turnstileSiteKey ? (
            <Card variant="secondary">
              <Turnstile
                sitekey={turnstileSiteKey}
                onVerify={setTurnstileToken}
              />
            </Card>
          ) : null}

          {needsTerms ? (
            <Checkbox
              id="login-terms"
              isSelected={termsAccepted}
              onChange={setTermsAccepted}
            >
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label htmlFor="login-terms">
                  I agree to the <RouterLink to="/terms">Terms</RouterLink> and{" "}
                  <RouterLink to="/privacy-policy">Privacy Policy</RouterLink>.
                </Label>
              </Checkbox.Content>
            </Checkbox>
          ) : null}

          {method === "magic" ? (
            <div className="space-y-2">
              <Button
                className="w-full"
                isDisabled={submitting}
                onPress={sendMagicLinkLogin}
              >
                Continue
              </Button>
              {magicLinkSent ? (
                <div className="text-sm text-muted pt-3 grid place-items-center">
                  <button
                    type="button"
                    className="underline-offset-4 hover:underline"
                    onClick={() => {
                      setMethod("password");
                      setMagicLinkSent(false);
                      setStep("password");
                    }}
                  >
                    Use password instead
                  </button>
                </div>
              ) : (
                ""
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                className="w-full"
                isDisabled={submitting}
                onPress={
                  step === "password" ? handlePasswordLogin : handle2faLogin
                }
              >
                {step === "password" ? "Sign in" : "Verify"}
              </Button>

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-muted">
                <button
                  type="button"
                  className="underline-offset-4 hover:underline"
                  onClick={() => {
                    setMethod("magic");
                    setMagicLinkSent(false);
                    setTurnstileToken("");
                    setStep("password");
                  }}
                >
                  Use magic link instead
                </button>

                {step === "2fa" ? (
                  <button
                    type="button"
                    className="underline-offset-4 hover:underline"
                    onClick={() => setStep("password")}
                  >
                    Back
                  </button>
                ) : (
                  <RouterLink
                    to="/auth/recover"
                    className="underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </RouterLink>
                )}
              </div>
            </div>
          )}

          <SocialLoginOptions
            redirectTo={redirectTo}
            ensureTerms={ensureTerms}
            isDisabled={submitting}
          />
        </Card.Content>

        {!status?.self_use_mode_enabled ? (
          <Card.Footer className="mr-4.5 ml-4.5 mt-1.5 mb-1 text-center">
            <div className="text-sm text-muted w-full text-center">
              Don't have an account?{" "}
              <RouterLink to="/auth/signup">Register</RouterLink>
            </div>
          </Card.Footer>
        ) : null}
      </Card>
    </div>
  );
}
