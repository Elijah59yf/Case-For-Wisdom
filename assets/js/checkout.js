// checkout.js — drives the storefront checkout from the cart page.
//
// Responsibility: collect customer details, ask the backend (via the one data
// client, api.js) for a Stripe PaymentIntent client secret, mount Stripe.js
// Elements, and confirm payment. It never calls fetch() against /api/* itself
// and never recomputes the authoritative total — the server re-prices the cart
// and returns { clientSecret } (CLAUDE.md §10).

import { createPaymentIntent } from "/assets/js/lib/api.js";
import { getCart } from "/assets/js/cart.js";

const SUCCESS_PATH = "/order-success/";

// Load Stripe.js from the official CDN exactly once.
function loadStripeJs() {
  if (window.Stripe) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://js.stripe.com/v3/"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Stripe.")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = "https://js.stripe.com/v3/";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment library."));
    document.head.appendChild(s);
  });
}

function publishableKey() {
  return document.querySelector('meta[name="stripe-publishable"]')?.content?.trim() || "";
}

const FORM_HTML = `
  <form class="checkout" data-checkout-form novalidate>
    <p class="checkout__title">Your details</p>

    <div class="checkout__field">
      <label for="co-name">Full name</label>
      <input id="co-name" name="name" type="text" autocomplete="name" required />
    </div>
    <div class="checkout__field">
      <label for="co-email">Email</label>
      <input id="co-email" name="email" type="email" autocomplete="email" required />
    </div>
    <div class="checkout__field">
      <label for="co-address1">Address</label>
      <input id="co-address1" name="address1" type="text" autocomplete="address-line1" required />
    </div>
    <div class="checkout__row">
      <div class="checkout__field">
        <label for="co-city">City</label>
        <input id="co-city" name="city" type="text" autocomplete="address-level2" />
      </div>
      <div class="checkout__field">
        <label for="co-region">Province</label>
        <input id="co-region" name="region" type="text" autocomplete="address-level1" />
      </div>
    </div>
    <div class="checkout__row">
      <div class="checkout__field">
        <label for="co-postal">Postal code</label>
        <input id="co-postal" name="postal" type="text" autocomplete="postal-code" />
      </div>
      <div class="checkout__field">
        <label for="co-country">Country</label>
        <input id="co-country" name="country" type="text" autocomplete="country-name" value="Canada" />
      </div>
    </div>

    <div data-card-wrap hidden>
      <p class="checkout__title">Payment</p>
      <div id="stripe-card-element" class="checkout__card"></div>
    </div>

    <p class="checkout__error" data-error role="alert"></p>

    <div class="checkout__actions">
      <button type="submit" class="btn btn--primary btn--block" data-submit>Continue to payment</button>
    </div>
  </form>`;

/**
 * Wire the "Proceed to checkout" trigger to the checkout flow.
 * @param {{ trigger: HTMLElement, mount: HTMLElement }} opts
 */
export function initCheckout({ trigger, mount }) {
  if (!trigger || !mount) return;

  let injected = false;
  let phase = "details";        // "details" → "pay"
  let stripe = null;
  let elements = null;
  let clientSecret = null;

  trigger.addEventListener("click", () => {
    if (!getCart().length) return;
    if (!injected) {
      mount.innerHTML = FORM_HTML;
      injected = true;
      bindForm();
    }
    trigger.hidden = true;
    mount.querySelector("[data-checkout-form]")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    mount.querySelector("#co-name")?.focus();
  });

  function bindForm() {
    const form = mount.querySelector("[data-checkout-form]");
    const submitBtn = form.querySelector("[data-submit]");
    const errorEl = form.querySelector("[data-error]");
    const cardWrap = form.querySelector("[data-card-wrap]");

    function showError(msg) { errorEl.textContent = msg || ""; }
    function setBusy(busy, label) {
      submitBtn.disabled = busy;
      if (label) submitBtn.textContent = label;
    }

    function readCustomer() {
      const v = (id) => form.querySelector(id)?.value.trim() || "";
      return {
        name: v("#co-name"),
        email: v("#co-email"),
        shipping_address: {
          line1: v("#co-address1"),
          city: v("#co-city"),
          region: v("#co-region"),
          postal_code: v("#co-postal"),
          country: v("#co-country"),
        },
      };
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showError("");

      if (phase === "details") {
        // Validate the essentials.
        const name = form.querySelector("#co-name").value.trim();
        const email = form.querySelector("#co-email").value.trim();
        const address1 = form.querySelector("#co-address1").value.trim();
        if (!name || !email || !address1) { showError("Please fill in your name, email, and address."); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError("Please enter a valid email address."); return; }

        const items = getCart().map((l) => ({ id: l.id, qty: l.qty }));
        if (!items.length) { showError("Your cart is empty."); return; }

        setBusy(true, "Preparing…");
        try {
          // 1–4. Server re-prices the cart and returns the client secret.
          const res = await createPaymentIntent({ items, customer: readCustomer() });
          clientSecret = res?.clientSecret;
          if (!clientSecret) throw new Error("Payment could not be started. Please try again.");

          // 5–7. Load Stripe.js and mount the Payment Element.
          const pk = publishableKey();
          if (!pk) throw new Error("Payments are not configured for this site yet.");
          await loadStripeJs();
          stripe = window.Stripe(pk);
          elements = stripe.elements({ clientSecret });
          const paymentElement = elements.create("payment");
          paymentElement.mount("#stripe-card-element");

          cardWrap.hidden = false;
          phase = "pay";
          setBusy(false, "Pay now");
          cardWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch (err) {
          showError(err?.message || "Something went wrong starting checkout.");
          setBusy(false, "Continue to payment");
        }
        return;
      }

      // phase === "pay" → 8. confirm the payment.
      setBusy(true, "Processing…");
      try {
        const { error } = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: `${window.location.origin}${SUCCESS_PATH}`,
          },
        });
        // If we reach here, confirmation failed without a redirect (10).
        if (error) {
          showError(error.message || "Payment could not be completed.");
          setBusy(false, "Pay now");
        }
        // On success Stripe redirects the browser to return_url (9).
      } catch (err) {
        showError(err?.message || "Payment could not be completed.");
        setBusy(false, "Pay now");
      }
    });
  }
}
