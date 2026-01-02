import React from "react";
import { StyleSheet, Text, View } from "react-native";

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

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>Try restarting the app.</Text>
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
