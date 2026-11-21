import type { Config } from "../lib/config";
import { ConsoleChannel, MemoryChannel, MetaWhatsAppChannel, Msg91SmsChannel, parseTemplateMap, type MessageChannel, type NotifyChannel } from "./providers";

export * from "./providers";
export * from "./service";
export * from "./templates";

/** Picks SMS and WhatsApp senders from settings. "off" leaves the channel out. */
export function channelsFromConfig(c: Config): Partial<Record<NotifyChannel, MessageChannel>> {
  const out: Partial<Record<NotifyChannel, MessageChannel>> = {};
  if (c.SMS_PROVIDER === "console") out.sms = new ConsoleChannel("sms");
  if (c.SMS_PROVIDER === "memory") out.sms = new MemoryChannel("sms");
  if (c.SMS_PROVIDER === "msg91") out.sms = new Msg91SmsChannel(c.MSG91_AUTH_KEY ?? "", parseTemplateMap(c.MSG91_SMS_TEMPLATES));
  if (c.WHATSAPP_PROVIDER === "console") out.whatsapp = new ConsoleChannel("whatsapp");
  if (c.WHATSAPP_PROVIDER === "memory") out.whatsapp = new MemoryChannel("whatsapp");
  if (c.WHATSAPP_PROVIDER === "meta") {
    out.whatsapp = new MetaWhatsAppChannel(c.WHATSAPP_TOKEN ?? "", c.WHATSAPP_PHONE_NUMBER_ID ?? "", c.WHATSAPP_TEMPLATE_LANG);
  }
  return out;
}
