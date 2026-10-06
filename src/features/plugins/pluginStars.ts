import { apiCallApi, getApiCallErrorMessage } from '@/services/api';
import type { PluginStoreEntry } from '@/types';
import { isRecord } from '@/utils/helpers';
import {
  GITHUB_API_BASE,
  GITHUB_API_HEADERS,
  getGitHubRepositorySlug,
} from './pluginReleaseVersions';

const GITHUB_SEARCH_PAGE_SIZE = 100;

export const PLUGIN_STORE_SORT_MODES = ['stars', 'registry'] as const;
export type PluginStoreSortMode = (typeof PLUGIN_STORE_SORT_MODES)[number];

export const getRepositoryStarsKey = (repository: string): string =>
  getGitHubRepositorySlug(repository).toLowerCase();

const fetchRepositoryStarsPage = async (slugs: string[]): Promise<Array<[string, number]>> => {
  const query = [...slugs.map((slug) => `repo:${slug}`), 'fork:true'].join(' ');
  const result = await apiCallApi.request({
    method: 'GET',
    url: `${GITHUB_API_BASE}/search/repositories?q=${encodeURIComponent(query)}&per_page=${GITHUB_SEARCH_PAGE_SIZE}`,
    header: GITHUB_API_HEADERS,
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(getApiCallErrorMessage(result));
  }

  if (!isRecord(result.body) || !Array.isArray(result.body.items)) {
    throw new Error('GitHub search response has no items');
  }

  return result.body.items.flatMap((item): Array<[string, number]> =>
    isRecord(item) &&
    typeof item.full_name === 'string' &&
    typeof item.stargazers_count === 'number'
      ? [[item.full_name.toLowerCase(), item.stargazers_count]]
      : []
  );
};

export const fetchPluginRepositoryStars = async (
  repositories: string[]
): Promise<Map<string, number>> => {
  const slugs = [...new Set(repositories.map(getRepositoryStarsKey).filter(Boolean))];
  const pages: string[][] = [];
  for (let start = 0; start < slugs.length; start += GITHUB_SEARCH_PAGE_SIZE) {
    pages.push(slugs.slice(start, start + GITHUB_SEARCH_PAGE_SIZE));
  }
  const results = await Promise.all(pages.map(fetchRepositoryStarsPage));
  return new Map(results.flat());
};

export const sortPluginStoreEntries = (
  entries: PluginStoreEntry[],
  mode: PluginStoreSortMode,
  stars: ReadonlyMap<string, number | null>
): PluginStoreEntry[] => {
  if (mode === 'registry') return entries;
  const starsOf = (entry: PluginStoreEntry) =>
    stars.get(getRepositoryStarsKey(entry.repository)) ?? -1;
  return [...entries].sort((a, b) => starsOf(b) - starsOf(a));
};
