// Serves page content for editorial pages and dynamic public content.
import { apiRequest } from "../api/apiClient.js";
import { API_ENDPOINTS } from "../constants/apiConfig.js";
import {
  brandValuesDetailed,
  faqGroups,
  milestones,
  processStepsDetailed,
  qualityStandards,
  storyTimeline,
  sustainabilityPoints,
} from "../data/pageData.js";
import { brandValues } from "../data/siteData.js";

export function getFaqGroups() {
  return faqGroups;
}

export function getStoryContent() {
  return { brandValuesDetailed, milestones, storyTimeline };
}

export function getProcessContent() {
  return { brandValues, processStepsDetailed, qualityStandards, sustainabilityPoints };
}

export async function fetchGalleryImages() {
  const response = await apiRequest(API_ENDPOINTS.gallery);
  return response?.items || response?.data?.items || [];
}

