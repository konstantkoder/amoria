import React from "react";

import LanguagePickerModal from "@/components/LanguagePickerModal";
import { useLocale } from "@/contexts/LocaleContext";
import { RELEASE_LANGUAGE_CODES } from "@/i18n/translations";

export default function LanguagePickerHost() {
  const {
    locale,
    setLocale,
    t,
    languagePickerVisible,
    languagePickerMandatory,
    closeLanguagePicker,
  } = useLocale();

  if (!languagePickerVisible) return null;

  return (
    <LanguagePickerModal
      visible={languagePickerVisible}
      currentLocale={locale}
      locales={RELEASE_LANGUAGE_CODES}
      mandatory={languagePickerMandatory}
      t={t}
      onSelect={setLocale}
      onClose={closeLanguagePicker}
    />
  );
}
