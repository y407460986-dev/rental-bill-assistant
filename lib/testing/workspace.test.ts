import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));

import Workspace from "@/components/Workspace";

describe("workspace server-rendered safety", () => {
  it("never offers a GET credential submission before hydration", () => {
    const html = renderToStaticMarkup(
      createElement(Workspace, { mode: "login" }),
    );
    const form = html.match(/<form\b[^>]*>/)?.[0];
    expect(form).toContain('method="post"');
    expect(form).toContain('action="/api/auth/login"');
    for (const name of ["email", "password"]) {
      const input = html.match(
        new RegExp(`<input\\b[^>]*name="${name}"[^>]*>`),
      )?.[0];
      expect(input).toContain('disabled=""');
    }
    const formBody = html.match(/<form\b[^>]*>([\s\S]*?)<\/form>/)?.[1];
    expect(formBody?.match(/<button\b[^>]*>/)?.[0]).toContain('disabled=""');
    expect(html).toContain("<noscript>");
  });
});
