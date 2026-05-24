import { describe, expect, it } from "vitest";
import { renderNunjucks, substituteTdlParameters } from "../src/renderer.js";

describe("renderNunjucks", () => {
  it("emits the template unchanged when no nunjuck tags present", () => {
    const xml = `<ENVELOPE><BODY><X>hello</X></BODY></ENVELOPE>`;
    expect(renderNunjucks(xml, {})).toBe(xml);
  });

  it("processes <nunjuck>if X</nunjuck>...<nunjuck>endif</nunjuck> conditionals", () => {
    const xml = `<A><nunjuck>if name</nunjuck><N>{{name | escape}}</N><nunjuck>endif</nunjuck></A>`;
    expect(renderNunjucks(xml, { name: "Acme" })).toBe("<A><N>Acme</N></A>");
    expect(renderNunjucks(xml, {})).toBe("<A></A>");
  });

  it("HTML-escapes interpolated variables via the |escape filter", () => {
    const xml = `<A>{{name | escape}}</A>`;
    expect(renderNunjucks(xml, { name: 'A & B "X" <Y>' })).toBe(
      "<A>A &amp; B &quot;X&quot; &lt;Y&gt;</A>",
    );
  });

  it("does NOT interpret {fromDate}-style angular braces (those belong to substitution layer)", () => {
    const xml = `<D>{fromDate}</D>`;
    expect(renderNunjucks(xml, { fromDate: "20220401" })).toBe("<D>{fromDate}</D>");
  });

  it("passes through a company name containing {{ and }} literals when not in variable position", () => {
    const xml = `<C>{{name | escape}}</C>`;
    // The user-supplied value '{{evil}}' is data, not template. Curly braces
    // are not HTML-special; they remain literal in the output, which is safe.
    expect(renderNunjucks(xml, { name: "{{evil}}" })).toBe("<C>{{evil}}</C>");
  });
});

describe("substituteTdlParameters", () => {
  it("replaces a string parameter with the HTML-escaped value", () => {
    const out = substituteTdlParameters("<C>{company}</C>", { company: "A & B" });
    expect(out).toBe("<C>A &amp; B</C>");
  });

  it("formats a Date parameter as d-MMM-yyyy (Tally display format)", () => {
    const out = substituteTdlParameters("<D>{date}</D>", { date: new Date(2022, 3, 1) });
    expect(out).toBe("<D>1-Apr-2022</D>");
  });

  it("stringifies a numeric parameter", () => {
    const out = substituteTdlParameters("<A>{amount}</A>", { amount: 12345.67 });
    expect(out).toBe("<A>12345.67</A>");
  });

  it("converts a boolean to Tally Yes/No", () => {
    expect(substituteTdlParameters("<B>{flag}</B>", { flag: true })).toBe("<B>Yes</B>");
    expect(substituteTdlParameters("<B>{flag}</B>", { flag: false })).toBe("<B>No</B>");
  });

  it("leaves placeholders untouched when the parameter is absent", () => {
    expect(substituteTdlParameters("<X>{missing}</X>", {})).toBe("<X>{missing}</X>");
  });

  it("replaces every occurrence of a parameter (global)", () => {
    const out = substituteTdlParameters("<A>{x}</A><B>{x}</B>", { x: "y" });
    expect(out).toBe("<A>y</A><B>y</B>");
  });

  it("does NOT process placeholders absent from the params map (nunjucks tokens pass through)", () => {
    // Substitution is param-keyed: only placeholders whose name is in `params`
    // are touched. Unknown placeholders pass through. A nunjucks token like
    // {{notInParams}} stays as-is when no matching param key exists.
    const out = substituteTdlParameters("<A>{{notInParams}}</A><nunjuck>if x</nunjuck>", {});
    expect(out).toBe("<A>{{notInParams}}</A><nunjuck>if x</nunjuck>");
  });
});
