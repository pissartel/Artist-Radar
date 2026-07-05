"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MainGoal, OnboardingFormData } from "@/types";
import FormField from "@/components/onboarding/FormField";

const MAIN_GOAL_OPTIONS: { value: MainGoal; label: string }[] = [
  { value: "booking_opportunities", label: "Find booking opportunities" },
  { value: "similar_artists", label: "Find similar artists" },
  { value: "opening_slots", label: "Find opening slots" },
  { value: "small_tour", label: "Plan a small tour" },
];

const INITIAL_FORM_DATA: OnboardingFormData = {
  artistName: "",
  spotifyUrl: "",
  youtubeUrl: "",
  instagramUrl: "",
  websiteUrl: "",
  countryOfOrigin: "",
  city: "",
  mainGenre: "",
  secondaryGenres: "",
  targetLocation: "",
  mainGoal: "booking_opportunities",
};

type FormErrors = Partial<Record<"artistName" | "countryOfOrigin" | "mainGenre", string>>;

const inputClass =
  "w-full bg-card-alt border border-slate-400/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors";

const inputErrorClass =
  "w-full bg-card-alt border border-red-400/50 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-red-400/70 focus:ring-1 focus:ring-red-400/30 transition-colors";

export default function OnboardingPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<OnboardingFormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<FormErrors>({});

  function updateField<K extends keyof OnboardingFormData>(
    field: K,
    value: OnboardingFormData[K]
  ) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function validate(): FormErrors {
    const nextErrors: FormErrors = {};
    if (!formData.artistName.trim()) {
      nextErrors.artistName = "Artist name is required.";
    }
    if (!formData.countryOfOrigin.trim()) {
      nextErrors.countryOfOrigin = "Country of origin is required.";
    }
    if (!formData.mainGenre.trim()) {
      nextErrors.mainGenre = "Main genre is required.";
    }
    return nextErrors;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      window.localStorage.setItem(
        "artistRadarOnboardingData",
        JSON.stringify(formData)
      );
    } catch {
      // localStorage unavailable — safe to ignore, dashboard still uses mock data.
    }

    router.push("/analyzing");
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <span className="text-accent-light font-bold text-lg tracking-tight">
            Artist Radar
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-white mt-3">
            Tell us about your artist project
          </h1>
          <p className="text-sm text-gray-400 mt-1.5">
            We&apos;ll use this to prepare your personalized dashboard with
            similar artists and booking opportunities.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-card rounded-xl border border-slate-400/10 shadow-card-glow p-5 sm:p-6 flex flex-col gap-5"
        >
          <FormField label="Artist name" htmlFor="artistName" required error={errors.artistName}>
            <input
              id="artistName"
              type="text"
              value={formData.artistName}
              onChange={(e) => updateField("artistName", e.target.value)}
              placeholder="e.g. Nova Ray"
              className={errors.artistName ? inputErrorClass : inputClass}
              aria-required="true"
              aria-invalid={Boolean(errors.artistName)}
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Spotify URL" htmlFor="spotifyUrl">
              <input
                id="spotifyUrl"
                type="url"
                value={formData.spotifyUrl}
                onChange={(e) => updateField("spotifyUrl", e.target.value)}
                placeholder="https://open.spotify.com/artist/..."
                className={inputClass}
              />
            </FormField>
            <FormField label="YouTube URL" htmlFor="youtubeUrl">
              <input
                id="youtubeUrl"
                type="url"
                value={formData.youtubeUrl}
                onChange={(e) => updateField("youtubeUrl", e.target.value)}
                placeholder="https://youtube.com/@..."
                className={inputClass}
              />
            </FormField>
            <FormField label="Instagram URL" htmlFor="instagramUrl">
              <input
                id="instagramUrl"
                type="url"
                value={formData.instagramUrl}
                onChange={(e) => updateField("instagramUrl", e.target.value)}
                placeholder="https://instagram.com/..."
                className={inputClass}
              />
            </FormField>
            <FormField label="Website URL" htmlFor="websiteUrl">
              <input
                id="websiteUrl"
                type="url"
                value={formData.websiteUrl}
                onChange={(e) => updateField("websiteUrl", e.target.value)}
                placeholder="https://..."
                className={inputClass}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Country of origin"
              htmlFor="countryOfOrigin"
              required
              error={errors.countryOfOrigin}
            >
              <input
                id="countryOfOrigin"
                type="text"
                value={formData.countryOfOrigin}
                onChange={(e) => updateField("countryOfOrigin", e.target.value)}
                placeholder="e.g. France"
                className={errors.countryOfOrigin ? inputErrorClass : inputClass}
                aria-required="true"
                aria-invalid={Boolean(errors.countryOfOrigin)}
              />
            </FormField>
            <FormField label="City" htmlFor="city">
              <input
                id="city"
                type="text"
                value={formData.city}
                onChange={(e) => updateField("city", e.target.value)}
                placeholder="e.g. Lyon"
                className={inputClass}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Main genre"
              htmlFor="mainGenre"
              required
              error={errors.mainGenre}
            >
              <input
                id="mainGenre"
                type="text"
                value={formData.mainGenre}
                onChange={(e) => updateField("mainGenre", e.target.value)}
                placeholder="e.g. Indie Pop"
                className={errors.mainGenre ? inputErrorClass : inputClass}
                aria-required="true"
                aria-invalid={Boolean(errors.mainGenre)}
              />
            </FormField>
            <FormField label="Secondary genres" htmlFor="secondaryGenres">
              <input
                id="secondaryGenres"
                type="text"
                value={formData.secondaryGenres}
                onChange={(e) => updateField("secondaryGenres", e.target.value)}
                placeholder="e.g. Synth-pop, Dream pop"
                className={inputClass}
              />
            </FormField>
          </div>

          <FormField label="Target country or target cities" htmlFor="targetLocation">
            <input
              id="targetLocation"
              type="text"
              value={formData.targetLocation}
              onChange={(e) => updateField("targetLocation", e.target.value)}
              placeholder="e.g. Germany, Berlin, Hamburg"
              className={inputClass}
            />
          </FormField>

          <FormField label="Main goal" htmlFor="mainGoal">
            <select
              id="mainGoal"
              value={formData.mainGoal}
              onChange={(e) => updateField("mainGoal", e.target.value as MainGoal)}
              className={inputClass}
            >
              {MAIN_GOAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>

          <button
            type="submit"
            className="mt-1 w-full bg-accent hover:bg-accent/90 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors duration-150 shadow-card"
          >
            Analyze artist
          </button>
        </form>
      </div>
    </div>
  );
}
