import test from "node:test";
import assert from "node:assert/strict";
import { customerAuthOtpMessage } from "../services/emailService.js";

test("first customer OTP is a personalized welcome message", () => {
  const message = customerAuthOtpMessage({ email: "customer@example.com", name: "Kumar Rohan" }, "123456", true);
  assert.equal(message.subject, "Welcome to Swavalambi Siddaganga Oil Mill");
  assert.match(message.text, /Welcome to Swavalambi Siddaganga Oil Mill, Kumar Rohan\./);
  assert.match(message.html, /Kumar Rohan/);
  assert.match(message.text, /expires in 5 minutes/i);
});

test("subsequent customer OTP retains the normal login message", () => {
  const message = customerAuthOtpMessage({ email: "customer@example.com", name: "Kumar Rohan" }, "123456", false);
  assert.equal(message.subject, "Your Swavalambi Siddaganga Oil Mill login code");
  assert.doesNotMatch(message.text, /^Welcome/);
});
