"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MainGoal, OnboardingFormData } from "@/types";
import FormField from "@/components/onboarding/FormField";
import OnboardingStepLayout from "@/components/onboarding/OnboardingStepLayout";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { LANDING_ROUTE } from "@/lib/navigation";
import { productFeatures } from "@/lib/productFeatures";

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
  useChartmetricEnrichment: false,
};

type FormErrors = Partial<Record<"artistName" | "countryOfOrigin" | "mainGenre", string>>;

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
    <OnboardingStepLayout step={1} totalSteps={2} showLogo backHref={LANDING_ROUTE}>
      <div className="text-center mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground mt-2">
          Tell us about your artist project
        </h1>
        <p className="text-sm text-foreground-secondary mt-1.5">
          We&apos;ll use this to prepare your personalized dashboard with
          similar artists and opportunities.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="bg-surface rounded-xl border border-border shadow-card-glow p-5 sm:p-6 flex flex-col gap-5"
      >
        <FormField label="Artist name" htmlFor="artistName" required error={errors.artistName}>
          <Input
            id="artistName"
            type="text"
            value={formData.artistName}
            onChange={(e) => updateField("artistName", e.target.value)}
            placeholder="e.g. Nova Ray"
            error={Boolean(errors.artistName)}
            aria-required="true"
          />
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Spotify URL" htmlFor="spotifyUrl">
            <Input
              id="spotifyUrl"
              type="url"
              value={formData.spotifyUrl}
              onChange={(e) => updateField("spotifyUrl", e.target.value)}
              placeholder="https://open.spotify.com/artist/..."
            />
          </FormField>
          <FormField label="YouTube URL" htmlFor="youtubeUrl">
            <Input
              id="youtubeUrl"
              type="url"
              value={formData.youtubeUrl}
              onChange={(e) => updateField("youtubeUrl", e.target.value)}
              placeholder="https://youtube.com/@..."
            />
          </FormField>
          <FormField label="Instagram URL" htmlFor="instagramUrl">
            <Input
              id="instagramUrl"
              type="url"
              value={formData.instagramUrl}
              onChange={(e) => updateField("instagramUrl", e.target.value)}
              placeholder="https://instagram.com/..."
            />
          </FormField>
          <FormField label="Website URL" htmlFor="websiteUrl">
            <Input
              id="websiteUrl"
              type="url"
              value={formData.websiteUrl}
              onChange={(e) => updateField("websiteUrl", e.target.value)}
              placeholder="https://..."
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
            <Input
              id="countryOfOrigin"
              type="text"
              value={formData.countryOfOrigin}
              onChange={(e) => updateField("countryOfOrigin", e.target.value)}
              placeholder="e.g. France"
              error={Boolean(errors.countryOfOrigin)}
              aria-required="true"
            />
          </FormField>
          <FormField label="City" htmlFor="city">
            <Input
              id="city"
              type="text"
              value={formData.city}
              onChange={(e) => updateField("city", e.target.value)}
              placeholder="e.g. Lyon"
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
            <Input
              id="mainGenre"
              type="text"
              value={formData.mainGenre}
              onChange={(e) => updateField("mainGenre", e.target.value)}
              placeholder="e.g. Indie Pop"
              error={Boolean(errors.mainGenre)}
              aria-required="true"
            />
          </FormField>
          <FormField label="Secondary genres" htmlFor="secondaryGenres">
            <Input
              id="secondaryGenres"
              type="text"
              value={formData.secondaryGenres}
              onChange={(e) => updateField("secondaryGenres", e.target.value)}
              placeholder="e.g. Synth-pop, Dream pop"
            />
          </FormField>
        </div>

        <FormField label="Target country or target cities" htmlFor="targetLocation">
          <Input
            id="targetLocation"
            type="text"
            value={formData.targetLocation}
            onChange={(e) => updateField("targetLocation", e.target.value)}
            placeholder="e.g. Germany, Berlin, Hamburg"
          />
        </FormField>

        <FormField label="Main goal" htmlFor="mainGoal">
          <Select
            id="mainGoal"
            value={formData.mainGoal}
            onChange={(e) => updateField("mainGoal", e.target.value as MainGoal)}
          >
            {MAIN_GOAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FormField>

        {productFeatures.chartmetricToggle && (
          <label htmlFor="useChartmetricEnrichment" className="flex items-center gap-2 text-sm text-foreground-secondary">
            <input
              id="useChartmetricEnrichment"
              type="checkbox"
              checked={formData.useChartmetricEnrichment}
              onChange={(e) => updateField("useChartmetricEnrichment", e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Use Chartmetric enrichment
          </label>
        )}

        <Button type="submit" variant="gradient" className="mt-1 w-full">
          Analyze artist
        </Button>
      </form>
    </OnboardingStepLayout>
  );
}
