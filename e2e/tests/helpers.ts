import { expect, type Page } from "@playwright/test";

export const TEST_PASSWORD = "Password123";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

export async function registerUser(
  page: Page,
  email: string,
  password: string = TEST_PASSWORD
): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm Password").fill(password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByRole("heading", { name: "Todo App" })).toBeVisible();
}

export async function loginUser(
  page: Page,
  email: string,
  password: string = TEST_PASSWORD
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Todo App" })).toBeVisible();
}

export async function createTodo(
  page: Page,
  title: string,
  description?: string
): Promise<void> {
  await page.getByRole("button", { name: "Add Todo" }).click();
  await expect(page.getByRole("heading", { name: "Create Todo" })).toBeVisible();
  await page.getByLabel("Title").fill(title);
  if (description) {
    await page.getByLabel("Description (optional)").fill(description);
  }
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Create Todo" })).toBeHidden();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
}
