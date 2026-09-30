// SPDX-License-Identifier: MPL-2.0

export interface Photo {
  // The id in the images.unsplash.com URL, without the "photo-" prefix.
  id: string;
  photographer: string;
  // The photo's page on unsplash.com, which the credit links to.
  page: string;
}

export interface BackgroundSettings {
  enabled: boolean;
  // A different photo in every new tab instead of one photo per day.
  shuffle: boolean;
}
