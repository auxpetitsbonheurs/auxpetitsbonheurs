import type { ReactNode } from "react";
import { type InvoiceDocument, type InvoiceTotals, formatInvoiceDate } from "~/domain/invoice";
import { formatRupeeAmount, formatRupees } from "~/lib/locale";

// The print view of an invoice (S-127): the same document as the PDF, laid out like the client's
// paper template. It is a printed page, not themed UI: its paper colours stay fixed in dark mode so
// a printout or screenshot always looks like the invoice. The template's grey-blue band is darkened
// here to #5F7279 so its white text meets AA contrast; the PDF keeps the template's #A4B0B5.

function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-sans text-[0.7rem] tracking-wide text-invoice-label uppercase ${className}`}>{children}</span>;
}

function totalsRows(doc: InvoiceDocument, totals: InvoiceTotals) {
  const { labels } = doc;
  return [
    { label: labels.subtotal, value: formatRupees(totals.subtotalRs) },
    ...(totals.discountRs > 0 ? [{ label: doc.discountLabel ?? "", value: `– ${formatRupees(totals.discountRs)}` }] : []),
    ...(totals.adjustmentRs !== 0 ? [{ label: labels.adjustment, value: `${totals.adjustmentRs < 0 ? "– " : ""}${formatRupees(Math.abs(totals.adjustmentRs))}` }] : []),
    { label: labels.downpayment, value: totals.paidRs > 0 ? `${labels.paid} ${formatRupees(totals.paidRs)}` : "" },
  ];
}

function Header({ doc }: { doc: InvoiceDocument }) {
  const { business, labels } = doc;
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="text-sm leading-snug">
        {business.legalName && <p>{business.legalName.toUpperCase()}</p>}
        {business.brn && <p>{`${labels.brn} ${business.brn}`}</p>}
        {business.address.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {business.phone && <p>{`${labels.phone} ${business.phone}`}</p>}
      </div>
      <img src="/brand/logo-badge-pink.svg" alt="Aux petits bonheurs" width={112} height={112} className="size-24 shrink-0 sm:size-28" />
    </header>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="border-b border-invoice-rule-strong px-2 pb-0.5">
        <Label>{label}</Label>
      </dt>
      <dd className="px-2 pt-1 wrap-anywhere">{children}</dd>
    </div>
  );
}

function Fields({ doc }: { doc: InvoiceDocument }) {
  const { labels, eventDate } = doc;
  return (
    <dl className="mt-6 grid gap-y-3 text-sm min-[30rem]:grid-cols-3">
      <Field label={labels.billTo}>{doc.billTo}</Field>
      <Field label={labels.eventDate}>
        {eventDate.day}
        {eventDate.suffix && <sup>{eventDate.suffix}</sup>} {eventDate.rest}
      </Field>
      <Field label={labels.instructions}>
        {doc.instructions.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </Field>
    </dl>
  );
}

function Items({ doc }: { doc: InvoiceDocument }) {
  const { labels } = doc;
  const empty = Math.max(0, 5 - doc.lines.length);
  const head = "bg-invoice-band px-2 py-1.5 font-sans text-[0.7rem] font-normal tracking-wide text-white uppercase";
  return (
    <table className="mt-6 w-full border-collapse text-sm">
      <thead>
        <tr>
          <th scope="col" className={`${head} w-[18%] text-start`}>{labels.quantity}</th>
          <th scope="col" className={`${head} text-start`}>{labels.description}</th>
          <th scope="col" className={`${head} text-end`}>{labels.unitPrice}</th>
          <th scope="col" className={`${head} text-end`}>{labels.total}</th>
        </tr>
      </thead>
      <tbody>
        {doc.lines.map((line, i) => (
          <tr key={i} className="border-b border-invoice-rule align-top">
            <td className="px-2 py-1.5">{line.quantity ?? ""}</td>
            <td className="px-2 py-1.5 wrap-anywhere">
              {line.description}
              {line.details.map((detail) => (
                <span key={detail} className="block text-xs text-invoice-label">
                  {detail}
                </span>
              ))}
            </td>
            <td className="px-2 py-1.5 text-end tabular-nums">{formatRupeeAmount(line.unitRs)}</td>
            <td className="px-2 py-1.5 text-end tabular-nums">{formatRupeeAmount(line.totalRs)}</td>
          </tr>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <tr key={`empty-${i}`} aria-hidden="true" className="h-8 border-b border-invoice-rule">
            <td colSpan={4} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Totals({ doc }: { doc: InvoiceDocument }) {
  const { totals, labels } = doc;
  const settled = totals.dueRs === 0 && totals.totalRs > 0;
  return (
    <div className="mt-0 flex items-center justify-end gap-6 border-t border-invoice-rule-strong max-[30rem]:flex-col max-[30rem]:items-stretch">
      {settled && (
        <p className="border-2 border-invoice-paid px-3 py-1 font-sans text-xl font-bold tracking-wider text-invoice-paid" data-testid="invoice-paid-stamp">
          {labels.paidStamp}
        </p>
      )}
      <dl className="w-full max-w-72 text-sm">
        {totalsRows(doc, totals).map((row) => (
          <div key={row.label} className="flex justify-between gap-4 border-b border-invoice-rule px-2 py-1.5">
            <dt>
              <Label>{row.label}</Label>
            </dt>
            <dd className="text-invoice-label tabular-nums">{row.value}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-b border-invoice-rule-strong px-2 py-1.5 font-bold">
          <dt>
            <Label className="font-bold">{labels.totalDue}</Label>
          </dt>
          <dd className="text-invoice-label tabular-nums">{formatRupees(totals.dueRs)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Payment({ doc }: { doc: InvoiceDocument }) {
  const { labels, payment } = doc;
  const details = [
    payment.bankName && `${labels.bank} ${payment.bankName}`,
    payment.accountName && `${labels.accountName} ${payment.accountName}`,
    payment.accountNumber && `${labels.accountNumber} ${payment.accountNumber}`,
    payment.juiceNumber && `${labels.juice} ${payment.juiceNumber}`,
  ].filter((line): line is string => Boolean(line));
  return (
    <footer className="mt-12 grid gap-5 text-sm leading-snug">
      {details.length > 0 && (
        <div>
          <p className="font-bold">{labels.paymentDetails}</p>
          {details.map((line) => (
            <p key={line} className="wrap-anywhere">
              {line}
            </p>
          ))}
        </div>
      )}
      {doc.terms.length > 0 && (
        <div>
          <p className="font-bold">{labels.paymentTerms}</p>
          {doc.terms.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
      {doc.thankYou && <p className="mt-4">{doc.thankYou}</p>}
    </footer>
  );
}

/** The whole invoice on white paper, in the order's language (`lang`). */
export function InvoiceSheet({ doc }: { doc: InvoiceDocument }) {
  return (
    <article lang={doc.locale} aria-labelledby="invoice-heading" className="mx-auto w-full max-w-[210mm] bg-white p-4 font-serif text-invoice-ink sm:p-12 print:max-w-none print:p-0">
      <Header doc={doc} />
      <h1 id="invoice-heading" className="mt-6 flex flex-wrap justify-between gap-x-4 bg-invoice-band px-2 py-1.5 font-sans text-base font-normal text-white sm:text-lg">
        <span>{`${doc.labels.invoiceNo} ${doc.number}`}</span>
        <span>{`${doc.labels.date} ${formatInvoiceDate(doc.date)}`}</span>
      </h1>
      <Fields doc={doc} />
      <Items doc={doc} />
      <Totals doc={doc} />
      <Payment doc={doc} />
    </article>
  );
}
