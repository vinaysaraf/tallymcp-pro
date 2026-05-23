/**
 * Number-format presets used across workbooks.
 *
 * The currency format uses the Indian lakh grouping convention
 * (`#,##,##0.00`) with parentheses for negatives. The negative-red variant
 * paints negatives red in Excel's standard colour palette.
 */
export const INR_FORMAT = "#,##,##0.00;(#,##,##0.00)";
export const INR_FORMAT_NEGATIVE_RED = "#,##,##0.00;[Red](#,##,##0.00)";

export const NUMBER_FORMATS = {
  "currency-inr": INR_FORMAT,
  "currency-inr-negative-red": INR_FORMAT_NEGATIVE_RED,
  integer: "#,##,##0",
  "percent-2": "0.00%",
  "date-dd-mm-yyyy": "dd-mm-yyyy",
  text: "@",
} as const satisfies Record<NumberFormatKey, string>;

export type NumberFormatKey =
  | "currency-inr"
  | "currency-inr-negative-red"
  | "integer"
  | "percent-2"
  | "date-dd-mm-yyyy"
  | "text";
