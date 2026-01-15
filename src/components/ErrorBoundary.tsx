import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LocaleContext } from "@/contexts/LocaleContext";

type ErrorBoundaryProps = {
  children: React.ReactNode;
  onError?: (error: Error) => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  static contextType = LocaleContext;
  context: any = null;

  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const t = this.context?.t ?? ((key: string) => key);

    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t("errorBoundary.title")}</Text>
        <Text style={styles.message}>{t("errorBoundary.message")}</Text>
        {__DEV__ && error?.message ? (
          <Text style={styles.devMessage}>{error.message}</Text>
        ) : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" },
  message: {
    color: "#cbd5f5",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  devMessage: {
    color: "#fca5a5",
    fontSize: 12,
    marginTop: 12,
    textAlign: "center",
  },
});
