import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, SHADOWS } from "../../theme";

interface SOSRadarButtonProps {
  onSOSTriggered: () => void;
}

export const SOSRadarButton: React.FC<SOSRadarButtonProps> = ({ onSOSTriggered }) => {
  const [holding, setHolding] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(3);
  
  // Animation values for concentric radar waves
  const pulseAnim1 = useRef(new Animated.Value(1)).current;
  const pulseAnim2 = useRef(new Animated.Value(1)).current;
  const holdProgress = useRef(new Animated.Value(0)).current;
  
  const timerRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);

  // Background radar loop animation
  useEffect(() => {
    const waveAnimation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim1, {
            toValue: 1.25,
            duration: 1800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim1, {
            toValue: 1,
            duration: 1800,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(pulseAnim2, {
            toValue: 1.45,
            duration: 2000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim2, {
            toValue: 1,
            duration: 2000,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    waveAnimation.start();
    return () => waveAnimation.stop();
  }, [pulseAnim1, pulseAnim2]);

  const handlePressIn = () => {
    setHolding(true);
    setSecondsRemaining(3);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    // Animate hold progress
    Animated.timing(holdProgress, {
      toValue: 1,
      duration: 3000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    // Start 3 second countdown
    let count = 3;
    countdownIntervalRef.current = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setSecondsRemaining(count);
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {}
      }
    }, 1000);

    timerRef.current = setTimeout(() => {
      clearHold();
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      onSOSTriggered();
    }, 3000);
  };

  const handlePressOut = () => {
    if (holding) {
      clearHold();
    }
  };

  const clearHold = () => {
    setHolding(false);
    setSecondsRemaining(3);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    Animated.timing(holdProgress, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  return (
    <View style={styles.outerContainer}>
      {/* Outer Radar Wave 2 */}
      <Animated.View
        style={[
          styles.radarRing2,
          {
            transform: [{ scale: pulseAnim2 }],
            opacity: holding ? 0.35 : 0.12,
          },
        ]}
      />

      {/* Inner Radar Wave 1 */}
      <Animated.View
        style={[
          styles.radarRing1,
          {
            transform: [{ scale: pulseAnim1 }],
            opacity: holding ? 0.5 : 0.22,
          },
        ]}
      />

      {/* Center SOS Push Button */}
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.buttonWrapper,
          pressed && styles.buttonPressed,
        ]}
      >
        <LinearGradient
          colors={["#FF2E54", "#E11D48", "#BE123C"]}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={styles.sosCircle}
        >
          <Text style={styles.holdText}>
            {holding ? `HOLDING...` : `HOLD FOR`}
          </Text>
          <Text style={styles.sosText}>SOS</Text>
          <Text style={styles.subText}>
            {holding ? `${secondsRemaining} SEC` : `3 sec`}
          </Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    alignItems: "center",
    justifyContent: "center",
    height: 250,
    marginVertical: 10,
  },
  radarRing2: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: COLORS.sosPrimary,
  },
  radarRing1: {
    position: "absolute",
    width: 195,
    height: 195,
    borderRadius: 97.5,
    backgroundColor: COLORS.sosPrimary,
  },
  buttonWrapper: {
    width: 148,
    height: 148,
    borderRadius: 74,
    ...SHADOWS.sosButton,
  },
  buttonPressed: {
    transform: [{ scale: 0.96 }],
  },
  sosCircle: {
    width: "100%",
    height: "100%",
    borderRadius: 74,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    borderWidth: 3,
    borderColor: "rgba(255, 255, 255, 0.4)",
  },
  holdText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    opacity: 0.9,
  },
  sosText: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
    marginVertical: -2,
  },
  subText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    opacity: 0.85,
  },
});
