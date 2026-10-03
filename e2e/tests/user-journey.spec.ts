import { expect, test } from "@playwright/test";
import {
  createTodo,
  logout,
  registerUser,
  uniqueEmail,
} from "./helpers";

test.describe("Full user journey", () => {
  test("register, create a todo, toggle completion, verify UI, then logout", async ({
    page,
  }) => {
    const email = uniqueEmail("journey");
    const title = `Buy milk ${Date.now()}`;

    await registerUser(page, email);
    await expect(page.getByText(email)).toBeVisible();

    await createTodo(page, title, "From the grocery store");
    await expect(page.getByText("From the grocery store")).toBeVisible();

    const checkbox = page.getByRole("checkbox", { name: title });
    await expect(checkbox).not.toBeChecked();
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await expect(page.getByText(title, { exact: true })).toHaveClass(
      /line-through/
    );

    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });
});
