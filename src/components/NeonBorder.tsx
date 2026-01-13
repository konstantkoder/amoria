import React from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  active?: boolean;
  radius?: number;
  inset?: number; // толщина "рамки"
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  children: React.ReactNode;
};

export default function NeonBorder({
  active = false,
  radius = 999,
  inset = 1,
  style,
  contentStyle,
  children,
}: Props) {
  const spin = React.useRef(new Animated.Value(0)).current;
  const glow = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!active) return;

    const spinAnim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 6500,
        useNativeDriver: true,
      }),
    );

    const glowAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );

    spinAnim.start();
    glowAnim.start();

    return () => {
      spinAnim.stop();
      glowAnim.stop();
    };
  }, [active, spin, glow]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const glowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.34],
  });

  return (
    <View style={[{ borderRadius: radius, overflow: "hidden" }, style]}>
      {/* Animated gradient ring */}
      {active ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              { transform: [{ rotate }] },
            ]}
          >
            <LinearGradient
              colors={["#ff6bd6", "#6b7cff", "#46e0c8", "#ffd166", "#ff6bd6"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
          </Animated.View>

          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              styles.glowLayer,
              { opacity: glowOpacity },
            ]}
          />
        </>
      ) : (
        // fallback static border for inactive chips
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
          ]}
        />
      )}

      {/* Inner content panel */}
      <View
        style={[
          {
            margin: inset,
            borderRadius: Math.max(0, radius - inset),
            backgroundColor: "rgba(10,16,32,0.72)",
          },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glowLayer: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
});
