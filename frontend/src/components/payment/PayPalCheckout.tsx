/**
 * OmniTrust — PayPal Sandbox Checkout Component
 *
 * Implements buyer approval flow using @paypal/react-paypal-js with intent="authorize".
 * Server holds credentials; client only receives approval authorization tokens.
 */
import React, { useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, AlertCircle, Clock } from "lucide-react";

import { authorizePayPalOrder, createPayPalOrder } from "@/lib/omni.functions";

interface PayPalCheckoutProps {
  orderId: string;
  amount: number;
  currency?: string;
  onSuccess?: () => void;
  onError?: (msg: string) => void;
}

export function PayPalCheckout({
  orderId,
  amount,
  currency = "USD",
  onSuccess,
  onError,
}: PayPalCheckoutProps) {
  const createOrderFn = useServerFn(createPayPalOrder);
  const authorizeOrderFn = useServerFn(authorizePayPalOrder);

  const [authError, setAuthError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Client ID from Vite environment (defaults to PayPal Sandbox 'test' client ID if not configured)
  const clientId =
    (import.meta as any).env?.VITE_PAYPAL_CLIENT_ID ||
    "test";

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4 shadow-sm backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
            PayPal Sandbox Authorization
          </span>
        </div>
        <span className="label-mono text-xs text-muted-foreground">Intent: AUTHORIZE</span>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Funds are authorized and held by PayPal. Money will <strong className="text-foreground">not</strong> release
        until delivery proof is signed and deterministic policy gates pass.
      </p>

      {authError ? (
        <div className="mb-3 flex items-center gap-2 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{authError}</span>
        </div>
      ) : null}

      {isProcessing ? (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
          <Clock className="h-4 w-4 animate-spin text-primary" />
          <span>Confirming authorization with PayPal…</span>
        </div>
      ) : (
        <PayPalScriptProvider
          options={{
            clientId: clientId,
            currency: currency,
            intent: "authorize",
            components: "buttons",
          }}
        >
          <PayPalButtons
            style={{ layout: "vertical", shape: "rect", height: 40 }}
            createOrder={async () => {
              setAuthError(null);
              try {
                const res = await createOrderFn({ data: { orderId } });
                return res.paypal_order_id;
              } catch (err: any) {
                const msg = err.message || "Failed to initialize PayPal order";
                setAuthError(msg);
                onError?.(msg);
                throw err;
              }
            }}
            onApprove={async (data) => {
              setIsProcessing(true);
              setAuthError(null);
              try {
                await authorizeOrderFn({
                  data: {
                    orderId,
                    paypalOrderId: data.orderID,
                  },
                });
                onSuccess?.();
              } catch (err: any) {
                const msg = err.message || "PayPal authorization confirmation failed";
                setAuthError(msg);
                onError?.(msg);
              } finally {
                setIsProcessing(false);
              }
            }}
            onCancel={() => {
              setAuthError("Buyer approval cancelled. No funds were authorized.");
            }}
            onError={(err) => {
              const msg = "PayPal Checkout encountered an error.";
              setAuthError(msg);
              onError?.(msg);
            }}
          />
        </PayPalScriptProvider>
      )}
    </div>
  );
}
