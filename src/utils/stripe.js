import Stripe from "stripe";
import mongoose from "mongoose";
import { Course } from "../models/course/course.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Helper function to get price in specific currency
const getPriceInCurrency = (course, currencyCode) => {
  currencyCode = currencyCode.toUpperCase();

  // Handle both Map and plain object formats
  let countryPrice;
  if (course.countryPrices instanceof Map) {
    countryPrice = course.countryPrices.get(currencyCode);
  } else if (typeof course.countryPrices === "object") {
    countryPrice = course.countryPrices[currencyCode];
  }

  if (countryPrice) {
    // Handle both {price, currency} objects and direct number values
    return {
      amount:
        typeof countryPrice === "object"
          ? Math.round(countryPrice.price * 100)
          : Math.round(countryPrice * 100),
      currency:
        typeof countryPrice === "object"
          ? (countryPrice.currency || "USD").toLowerCase()
          : "usd",
    };
  }

  // Fallback to default price in USD
  return {
    amount: Math.round(course.defaultPrice * 100),
    currency: "usd",
  };
};

// Stripe supported currencies (add more as needed)
const STRIPE_SUPPORTED_CURRENCIES = new Set([
  "usd",
  "eur",
  "gbp",
  "jpy",
  "cad",
  "aud",
  "inr",
  "sgd",
]);

export const createCheckoutSession = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phone, courseId, currency } = req.body;

  // Validate required fields
  if (!firstName || !email || !phone || !courseId || !currency) {
    return res.status(400).json({
      success: false,
      message: "All fields are required",
    });
  }

  // Validate course ID
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid course ID",
    });
  }

  // Find the course
  const course = await Course.findById(courseId);
  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  try {
    // Get price in requested currency
    const { amount, currency: selectedCurrency } = getPriceInCurrency(
      course,
      currency
    );

    // Validate currency is supported by Stripe
    const finalCurrency = STRIPE_SUPPORTED_CURRENCIES.has(selectedCurrency)
      ? selectedCurrency
      : "usd"; // Fallback to USD

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: finalCurrency,
            product_data: {
              name: course.packageName,
              description: course.shortDesc || "Course enrollment",
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",

      success_url: `${process.env.CLIENT_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/courses/${courseId}`,
      invoice_creation: { enabled: true },
      metadata: {
        firstName,
        lastName,
        email,
        phone,
        courseId: course._id.toString(),
        originalCurrency: currency.toUpperCase(),
      },
    });

    res.status(200).json({
      success: true,
      url: session.url,
    });
  } catch (error) {
    console.error("Stripe error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Payment processing failed",
    });
  }
});
