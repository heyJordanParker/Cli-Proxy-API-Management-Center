import { describe, expect, spyOn, test } from 'bun:test';
import {
  fetchPluginRepositoryStars,
  getRepositoryStarsKey,
  sortPluginStoreEntries,
} from '@/features/plugins/pluginStars';
import { apiCallApi } from '@/services/api';
import type { PluginStoreEntry } from '@/types';

const searchResponse = (items: unknown[], statusCode = 200) => ({
  statusCode,
  header: {},
  bodyText: '',
  body: { total_count: items.length, items },
});

const entry = (id: string, repository: string): PluginStoreEntry => ({
  storeId: id,
  sourceId: 'default',
  sourceName: '',
  sourceUrl: '',
  id,
  name: id,
  description: '',
  author: '',
  version: '1.0.0',
  repository,
  installType: 'github-release',
  authRequired: false,
  authConfigured: false,
  platforms: [],
  logo: '',
  homepage: '',
  license: '',
  tags: [],
  installed: false,
  installedVersion: '',
  path: '',
  configured: false,
  registered: false,
  enabled: false,
  effectiveEnabled: false,
  updateAvailable: false,
});

describe('getRepositoryStarsKey', () => {
  test('keys a GitHub URL by its lowercase owner/repo slug', () => {
    expect(getRepositoryStarsKey('https://github.com/Router-For-Me/CLIProxyAPI.git')).toBe(
      'router-for-me/cliproxyapi'
    );
  });

  test('returns an empty key for a repository outside GitHub', () => {
    expect(getRepositoryStarsKey('https://gitlab.com/a/b')).toBe('');
  });
});

describe('fetchPluginRepositoryStars', () => {
  test('asks GitHub search for every repository in one request', async () => {
    const request = spyOn(apiCallApi, 'request').mockResolvedValue(
      searchResponse([
        { full_name: 'Router-For-Me/CLIProxyAPI', stargazers_count: 54335 },
        { full_name: 'a/b', stargazers_count: 7 },
        { full_name: 'broken/item' },
      ])
    );
    try {
      const stars = await fetchPluginRepositoryStars([
        'https://github.com/router-for-me/CLIProxyAPI',
        'https://github.com/a/b',
        'https://github.com/A/B',
        'https://gitlab.com/x/y',
      ]);

      expect(request).toHaveBeenCalledTimes(1);
      const url = new URL(request.mock.calls[0][0].url);
      expect(url.pathname).toBe('/search/repositories');
      expect(url.searchParams.get('q')).toBe('repo:router-for-me/cliproxyapi repo:a/b fork:true');
      expect(url.searchParams.get('per_page')).toBe('100');
      expect([...stars]).toEqual([
        ['router-for-me/cliproxyapi', 54335],
        ['a/b', 7],
      ]);
    } finally {
      request.mockRestore();
    }
  });

  test('splits more than 100 repositories into pages of 100', async () => {
    const request = spyOn(apiCallApi, 'request').mockResolvedValue(searchResponse([]));
    try {
      const repositories = Array.from(
        { length: 150 },
        (_, index) => `https://github.com/owner/repo-${index}`
      );
      await fetchPluginRepositoryStars(repositories);

      const queries = request.mock.calls.map((call) =>
        new URL(call[0].url).searchParams.get('q')?.split(' ')
      );
      expect(queries.map((terms) => terms?.length)).toEqual([101, 51]);
    } finally {
      request.mockRestore();
    }
  });

  test('throws when GitHub rejects the search', async () => {
    const request = spyOn(apiCallApi, 'request').mockResolvedValue(searchResponse([], 403));
    try {
      await expect(fetchPluginRepositoryStars(['https://github.com/a/b'])).rejects.toThrow('403');
    } finally {
      request.mockRestore();
    }
  });
});

describe('sortPluginStoreEntries', () => {
  const plugins = [
    entry('unknown', 'https://github.com/x/unknown'),
    entry('few', 'https://github.com/x/few'),
    entry('many', 'https://github.com/x/many'),
    entry('missing', 'https://github.com/x/missing'),
    entry('few-too', 'https://github.com/x/few-too'),
  ];
  const stars = new Map<string, number | null>([
    ['x/few', 3],
    ['x/many', 900],
    ['x/missing', null],
    ['x/few-too', 3],
  ]);

  test('puts the most stars first and unknown counts last, keeping registry order on ties', () => {
    expect(sortPluginStoreEntries(plugins, 'stars', stars).map((plugin) => plugin.id)).toEqual([
      'many',
      'few',
      'few-too',
      'unknown',
      'missing',
    ]);
  });

  test('keeps registry order in registry mode', () => {
    expect(sortPluginStoreEntries(plugins, 'registry', stars)).toBe(plugins);
  });
});
