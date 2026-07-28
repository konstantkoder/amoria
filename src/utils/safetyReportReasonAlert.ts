import { Alert, Platform, type AlertButton } from "react-native";

export function makeAndroidSafeReportReasonButtons(
  buttons: AlertButton[],
  title: string,
  body: string,
  moreLabel: string
): AlertButton[] {
  if (Platform.OS !== "android" || buttons.length <= 3) {
    return buttons;
  }

  const showFinalReasons = () => {
    Alert.alert(title, body, buttons.slice(4, 6));
  };
  const showAdditionalReasons = () => {
    Alert.alert(title, body, [
      ...buttons.slice(2, 4),
      { text: moreLabel, onPress: showFinalReasons },
    ]);
  };

  return [
    ...buttons.slice(0, 2),
    { text: moreLabel, onPress: showAdditionalReasons },
  ];
}
