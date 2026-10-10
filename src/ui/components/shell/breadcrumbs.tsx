import Link from 'next/link';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <div className="breadcrumbs-bar" role="navigation" aria-label="Breadcrumbs">
      <div className="container-wide breadcrumbs-inner">
        <Link href="/" className="breadcrumb-link">
          whylab
        </Link>
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span className="breadcrumb-sep">/</span>
              {isLast || !item.href ? (
                <span className="breadcrumb-current" aria-current="page">
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="breadcrumb-link">
                  {item.label}
                </Link>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
