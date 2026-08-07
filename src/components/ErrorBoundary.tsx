import React from "react";
import { StyleSheet, Text, View } from "react-native";
import ScreenBackground from "@/components/ScreenBackground";
import { LocaleContext } from "@/contexts/LocaleContext";
import { visualSystem } from "@/theme/visualSystem";

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
      <ScreenBackground variant="profileArchGardenV6">
        <View style={styles.container}>
          <Text style={styles.title}>{t("errorBoundary.title")}</Text>
          <Text style={styles.message}>{t("errorBoundary.message")}</Text>
          {__DEV__ && error?.message ? (
            <Text style={styles.devMessage}>{error.message}</Text>
          ) : null}
        </View>
      </ScreenBackground>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: { color: visualSystem.colors.text, fontSize: 18, fontWeight: "700" },
  message: {
    color: visualSystem.colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  devMessage: {
    color: visualSystem.colors.dangerText,
    fontSize: 12,
    marginTop: 12,
    textAlign: "center",
  },
});
