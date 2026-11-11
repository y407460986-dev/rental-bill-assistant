import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { SignupInput } from "../signup";

const valid = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "correct-horse",
  role: "TENANT" as const,
};

describe("signup input", () => {
  it("trims the display name", () => {
    expect(SignupInput.parse({ ...valid, name: "  Ada  " }).name).toBe("Ada");
  });
  it("accepts both tenant and landlord accounts", () => {
    expect(SignupInput.parse(valid).role).toBe("TENANT");
    expect(SignupInput.parse({ ...valid, role: "LANDLORD" }).role).toBe(
      "LANDLORD",
    );
  });
  it("rejects short passwords and malformed emails", () => {
    expect(() => SignupInput.parse({ ...valid, password: "short" })).toThrow();
    expect(() =>
      SignupInput.parse({ ...valid, email: "not-an-email" }),
    ).toThrow();
  });
  it("rejects a missing or unknown role", () => {
    expect(() =>
      SignupInput.parse({
        name: valid.name,
        email: valid.email,
        password: valid.password,
      }),
    ).toThrow();
    expect(() => SignupInput.parse({ ...valid, role: "ADMIN" })).toThrow();
  });
});
