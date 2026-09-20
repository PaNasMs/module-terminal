import messages from "./server-messages.json";
import {
  registerTranslations,
  registerServerMessages,
  translator,
} from "@panasms/i18n";
import en from "./locales/en.json";
import ru from "./locales/ru.json";
import uk from "./locales/uk.json";
registerTranslations("terminal", { en, ru, uk });
registerServerMessages("terminal", messages);
export const tr = translator("terminal");
export { locale } from "@panasms/i18n";
