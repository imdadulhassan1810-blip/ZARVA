import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import {
  HOME_REVIEW_RULES, homeReviewBadTags, homeReviewGoodTags, homeReviewTagLabel,
  type HomeRatingSummary, type HomeReview, type HomeReviewTag, type SupportStatus,
} from "@zarva/core";
import type { Theme } from "./theme";
import { Button, Card, Chip, haptic, Ionicons } from "./ui";

/** Shared by ZARVA (customer) and ZARVA Partner: stars, review cards, rating summary. */

export const STAR = "#F5A524";

export function Stars({ t, value, size = 15 }: { t: Theme; value: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 1 }} accessible accessibilityLabel={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} size={size} color={value >= n - 0.25 ? STAR : value >= n - 0.75 ? STAR : t.border}
          name={value >= n - 0.25 ? "star" : value >= n - 0.75 ? "star-half" : "star-outline"} />
      ))}
    </View>
  );
}

/** "★ 4.6 (23)". Renders nothing until there is at least one real rating. */
export function RatingBadge({ t, summary }: { t: Theme; summary?: { average: number | null; count: number } }) {
  if (!summary || !summary.count || summary.average === null) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      <Ionicons name="star" size={13} color={STAR} />
      <Text style={{ color: t.text, fontWeight: "700", fontSize: 13 }}>{summary.average.toFixed(1)}</Text>
      <Text style={{ color: t.muted, fontSize: 13 }}>({summary.count})</Text>
    </View>
  );
}

export function RatingOverview({ t, summary }: { t: Theme; summary: HomeRatingSummary }) {
  return (
    <Card t={t} style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
      <View style={{ alignItems: "center", gap: 4 }}>
        <Text style={{ color: t.text, fontSize: 36, fontWeight: "800" }}>{summary.average?.toFixed(1) ?? "–"}</Text>
        <Stars t={t} value={summary.average ?? 0} />
        <Text style={{ color: t.muted, fontSize: 12 }}>{summary.count} rating{summary.count === 1 ? "" : "s"}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        {[5, 4, 3, 2, 1].map((n) => {
          const c = summary.stars[n - 1] ?? 0;
          return (
            <View key={n} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ color: t.muted, fontSize: 12, width: 12 }}>{n}</Text>
              <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: t.surface2, overflow: "hidden" }}>
                <View style={{ width: `${summary.count ? (c / summary.count) * 100 : 0}%`, height: 6, backgroundColor: STAR }} />
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

export function ReviewItem({ t, r }: { t: Theme; r: HomeReview }) {
  return (
    <Card t={t} style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Stars t={t} value={r.rating} />
        <Text style={{ color: t.muted, fontSize: 12 }}>{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Text>
      </View>
      {r.comment ? <Text style={{ color: t.text }}>“{r.comment}”</Text> : null}
      {r.tags.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {r.tags.map((tag) => (
            <Text key={tag} style={{ color: t.text, fontSize: 12, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: t.surface2 }}>{homeReviewTagLabel[tag]}</Text>
          ))}
        </View>
      )}
      <Text style={{ color: t.muted, fontSize: 12 }}>
        <Text style={{ color: t.text, fontWeight: "700" }}>{r.customerName}</Text> · {r.serviceNames || r.categoryName}{r.proName ? ` by ${r.proName}` : ""}
      </Text>
    </Card>
  );
}

export function StarPicker({ t, value, onChange, size = 38 }: { t: Theme; value: number; onChange: (n: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} accessibilityRole="radio" accessibilityState={{ checked: value === n }} accessibilityLabel={`${n} star${n > 1 ? "s" : ""}`}
          hitSlop={4} onPress={() => { haptic.tap(); onChange(n); }}>
          <Ionicons name={value >= n ? "star" : "star-outline"} size={size} color={value >= n ? STAR : t.muted} />
        </Pressable>
      ))}
    </View>
  );
}

/** Multi-line text box styled like Field. */
export function TextArea({ t, label, value, onChange, placeholder, maxLength, minHeight = 96 }: {
  t: Theme; label: string; value: string; onChange: (s: string) => void; placeholder?: string; maxLength?: number; minHeight?: number;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.text, fontWeight: "600", fontSize: 14 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label} multiline value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={t.muted}
        maxLength={maxLength} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} textAlignVertical="top"
        style={{ minHeight, borderWidth: focus ? 2 : 1, borderColor: focus ? t.primary : t.border, borderRadius: 14, backgroundColor: t.surface, color: t.text, fontSize: 16, padding: focus ? 11 : 12 }}
      />
    </View>
  );
}

/** Stars + matching tags + comment, used on a completed booking. */
export function RateForm({ t, proName, initial, saving, onSubmit, onCancel }: {
  t: Theme; proName: string; initial?: HomeReview | null; saving: boolean;
  onSubmit: (r: { rating: number; tags: HomeReviewTag[]; comment?: string }) => void; onCancel?: () => void;
}) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [tags, setTags] = useState<HomeReviewTag[]>(initial?.tags ?? []);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const choices = rating >= 4 ? homeReviewGoodTags : rating > 0 && rating <= 2 ? homeReviewBadTags : rating === 3 ? [...homeReviewGoodTags, ...homeReviewBadTags] : [];
  return (
    <Card t={t} style={{ gap: 12 }}>
      <Text style={{ color: t.text, fontWeight: "800", fontSize: 17 }}>How was {proName}?</Text>
      <StarPicker t={t} value={rating} onChange={setRating} />
      {choices.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {choices.map((c) => (
            <Chip key={c} t={t} label={homeReviewTagLabel[c]} on={tags.includes(c)} onPress={() => setTags((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))} />
          ))}
        </View>
      )}
      {rating > 0 && (
        <TextArea t={t} label="Anything to add? (optional)" value={comment} onChange={setComment} maxLength={HOME_REVIEW_RULES.maxComment} placeholder="What went well, or what could be better" />
      )}
      <Text style={{ color: t.muted, fontSize: 12 }}>Your first name and last initial show with your review. Never your number.</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button t={t} title={initial ? "Save changes" : "Submit rating"} disabled={rating === 0} loading={saving} style={{ flex: 1 }}
          onPress={() => onSubmit({ rating, tags: tags.filter((x) => choices.includes(x)), comment: comment.trim() || undefined })} />
        {onCancel && <Button t={t} variant="outline" title="Cancel" onPress={onCancel} />}
      </View>
    </Card>
  );
}

export function ticketColor(t: Theme, s: SupportStatus): string {
  return s === "resolved" ? t.success : s === "waiting_customer" ? t.warning : t.info;
}
