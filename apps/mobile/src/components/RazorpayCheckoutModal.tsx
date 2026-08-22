import { Modal, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

export interface RazorpaySuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface Props {
  visible: boolean;
  keyId: string;
  amount: number; // in the smallest currency unit (paise)
  currency: string;
  razorpayOrderId: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  /** Restricts which tab of the Checkout widget opens — e.g. {card:'1',netbanking:'0',upi:'0',wallet:'0'}. */
  method?: Record<string, string>;
  onSuccess: (response: RazorpaySuccessResponse) => void;
  onDismiss: () => void;
}

/**
 * Razorpay's native SDK needs a custom dev client (won't run in Expo Go without
 * ejecting), so this opens their standard web Checkout.js inside a WebView instead —
 * the officially documented fallback for Expo-managed apps. The page auto-opens the
 * checkout on load and posts the result back to React Native.
 */
export function RazorpayCheckoutModal({
  visible,
  keyId,
  amount,
  currency,
  razorpayOrderId,
  name,
  description,
  prefill,
  method,
  onSuccess,
  onDismiss,
}: Props) {
  const html = `
<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;background:#f8fafc;">
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    function post(msg) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
    try {
      const rzp = new Razorpay({
        key: ${JSON.stringify(keyId)},
        amount: ${JSON.stringify(amount)},
        currency: ${JSON.stringify(currency)},
        order_id: ${JSON.stringify(razorpayOrderId)},
        name: ${JSON.stringify(name)},
        description: ${JSON.stringify(description ?? "")},
        prefill: ${JSON.stringify(prefill ?? {})},
        theme: { color: "#2a5cf5" },
        ${method ? `method: ${JSON.stringify(method)},` : ""}
        handler: function (response) { post({ type: "success", ...response }); },
        modal: { ondismiss: function () { post({ type: "dismiss" }); } }
      });
      rzp.open();
    } catch (e) {
      post({ type: "error", message: String(e) });
    }
  </script>
</body>
</html>`;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.container}>
        <WebView
          originWhitelist={["*"]}
          source={{ html }}
          onMessage={(event) => {
            try {
              const msg = JSON.parse(event.nativeEvent.data) as { type: string } & Partial<RazorpaySuccessResponse>;
              if (msg.type === "success" && msg.razorpay_order_id && msg.razorpay_payment_id && msg.razorpay_signature) {
                onSuccess({
                  razorpay_order_id: msg.razorpay_order_id,
                  razorpay_payment_id: msg.razorpay_payment_id,
                  razorpay_signature: msg.razorpay_signature,
                });
              } else {
                onDismiss();
              }
            } catch {
              onDismiss();
            }
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
});
