/** @param {Date} date */
export function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** @param {string} isoDate */
function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

/**
 * Dollars of subscription cost inside an inclusive local-date window.
 * Annual plans are spread across 365 days. Monthly plans are treated as
 * 12 payments, also spread across 365 days.
 *
 * @param {Array<{ amount_cents: number, cadence: "monthly" | "annual", starts_on: string, ends_on: string | null }>} subscriptions
 * @param {string} startDate
 * @param {string} endDate
 */
export function subscriptionCostUsd(subscriptions, startDate, endDate) {
  let cents = 0;
  for (let day = startDate; day <= endDate; day = addDays(day, 1)) {
    for (const subscription of subscriptions) {
      if (day < subscription.starts_on) continue;
      if (subscription.ends_on && day > subscription.ends_on) continue;
      const yearly =
        subscription.cadence === "annual"
          ? subscription.amount_cents
          : subscription.amount_cents * 12;
      cents += yearly / 365;
    }
  }
  return cents / 100;
}
