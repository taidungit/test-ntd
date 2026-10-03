import { expect, test } from "@playwright/test";
import { createTodo, registerUser, uniqueEmail } from "./helpers";

test.describe("Cross-user data isolation", () => {
  test("User B cannot see a private todo created by User A", async ({
    browser,
  }) => {
    const privateTitle = `User A secret ${Date.now()}`;
    const emailA = uniqueEmail("user-a");
    const emailB = uniqueEmail("user-b");

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await registerUser(pageA, emailA);
      await createTodo(pageA, privateTitle, "Must not leak to User B");
      await expect(pageA.getByText(privateTitle, { exact: true })).toBeVisible();

      await registerUser(pageB, emailB);
      await expect(pageB.getByText(emailB)).toBeVisible();
      await expect(pageB.getByText(privateTitle)).toHaveCount(0);
      await expect(pageB.getByText("No todos yet")).toBeVisible();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
