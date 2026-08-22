import { Link } from "react-router-dom";
import type { CategoryDef } from "@oneapp/shared";

export function CategoryCard({ category }: { category: CategoryDef }) {
  const to = category.group === "bills" ? "/bills" : `/category/${category.slug}`;
  return (
    <Link
      to={to}
      className="bg-surface rounded-xl border border-slate-200 p-4 flex flex-col items-center gap-2 text-center hover:shadow-md hover:border-brand-300 transition"
    >
      <span className="text-3xl">{category.icon}</span>
      <span className="font-semibold text-sm">{category.name}</span>
      <span className="text-xs text-slate-500 leading-snug">{category.description}</span>
    </Link>
  );
}
