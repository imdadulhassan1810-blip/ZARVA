import { Link } from "react-router-dom";
import type { Listing } from "@oneapp/shared";

export function ListingCard({ listing }: { listing: Listing }) {
  return (
    <Link
      to={`/listing/${listing.id}`}
      className="bg-white rounded-xl border border-slate-200 p-4 flex gap-4 hover:shadow-md hover:border-brand-300 transition"
    >
      <div className="text-4xl leading-none">{listing.imageEmoji}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">{listing.title}</h3>
            {listing.subtitle && <p className="text-sm text-slate-500">{listing.subtitle}</p>}
          </div>
          <div className="text-right shrink-0">
            <div className="font-bold text-brand-700">₹{listing.price.toLocaleString("en-IN")}</div>
            <div className="text-xs text-slate-500">{listing.priceUnit}</div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {listing.location && <span>📍 {listing.location}</span>}
          {listing.rating != null && <span>⭐ {listing.rating.toFixed(1)}</span>}
          {listing.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="bg-slate-100 rounded-full px-2 py-0.5">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
