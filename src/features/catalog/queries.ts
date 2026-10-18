import { cache } from 'react';
import { createServerSupabase } from '@/lib/supabase/clients';
import { type QueryResult, querySuccess, queryFailure } from '@/lib/queries/result';
import type { BookReadingStatus } from '@/features/reading/schemas';

export type Book = {
  id: string; title: string; slug: string; author_id: string; cover_url: string | null;
  isbn13: string | null; language: string | null;
  synopsis: string | null; total_chapters: number | null; total_pages: number | null;
  publication_year: number | null; tags: string[] | null; amazon_url: string | null;
  publisher: string | null; translator: string | null; publication_date: string | null;
  content_rating: string | null; edition_number: number | null; format: string | null;
  width_mm: number | null; height_mm: number | null; depth_mm: number | null;
  authors?: { name: string; bio?: string | null; website_url?: string | null; instagram?: string | null } | null;
  warnings?: { label: string; description: string | null; severity: string; is_community: boolean }[];
  readerLists?: { id: string; title: string }[];
  signedIn?: boolean;
  readingStatus?: 'want_to_read' | 'reading' | 'read' | 'dnf' | null;
  isRecommended?: boolean;
  recommendationScore?: number;
};
export type Season = { id: string; number: number; title: string; slug: string; book_id: string; status: string; description: string | null; starts_at: string | null; ends_at: string | null; cover_url: string | null };
export type Chapter = { id: string; season_id: string; number: number; title: string; reading_range: string | null; youtube_url: string | null; summary: string | null; published_at: string | null };
export type ChapterAccess = { chapter_id: string; chapter_number: number; chapter_title: string; reading_range: string | null; published_at: string | null; can_open: boolean; requires_quiz: boolean };
type ChapterNavigation = { id: string; number: number; title: string; published_at: string | null; canOpen: boolean };
export type SeasonMilestone = { id: string; title: string; description: string | null; chapter_from: number | null; chapter_to: number | null; target_date: string | null; completed: boolean };
export type Meeting = {
  id: string;
  chapter_id: string | null;
  book_id?: string | null;
  club_id?: string | null;
  title: string;
  status: string;
  kind: string;
  scheduled_at: string;
  duration_min: number | null;
  meeting_url: string | null;
  location: string | null;
  agenda: string | null;
  spoiler_policy?: string | null;
  version?: number;
  books?: { id: string; slug: string; title: string } | null;
  user_clubs?: { id: string; slug: string; name: string } | null;
};

export type CatalogPageResult = {
  books: Book[];
  total: number;
  page: number;
  totalPages: number;
  isPersonalized?: boolean;
};

const FULL_BOOK_COLUMNS =
  'id,title,slug,author_id,cover_url,isbn13,language,synopsis,total_chapters,total_pages,publication_year,tags,amazon_url,publisher,translator,publication_date,content_rating,edition_number,format,width_mm,height_mm,depth_mm';

export const getBooksResult = cache(
  async (search?: string, page: number = 1, limit: number = 24): Promise<QueryResult<CatalogPageResult>> => {
    const client = await createServerSupabase();
    const offset = Math.max(0, (page - 1) * limit);

    const term = search?.trim().replace(/[%,()]/g, '');

    // Check if the user is authenticated and has reading history
    let userReadingsMap: Map<string, BookReadingStatus> | null = null;
    let externalHistoryBooks: Book[] = [];

    try {
      const { data: claims } = await client.auth.getClaims();
      const readerId = typeof claims?.claims?.sub === 'string' ? claims.claims.sub : null;

      if (readerId) {
        const { data: readingRows } = await client
          .from('user_book_readings')
          .select('book_id, status')
          .eq('user_id', readerId);

        if (readingRows && readingRows.length > 0) {
          userReadingsMap = new Map(
            readingRows.map((r) => [r.book_id, r.status as BookReadingStatus]),
          );

          const historyIds = readingRows
            .filter((r) => r.status === 'read' || r.status === 'reading')
            .map((r) => r.book_id);

          if (historyIds.length > 0) {
            const { data: histData } = await client
              .from('books')
              .select('id,author_id,tags')
              .in('id', historyIds);
            externalHistoryBooks = (histData ?? []) as Book[];
          }
        }
      }
    } catch {
      // Auth or reading query fallback: proceed as guest
      userReadingsMap = null;
    }

    if (userReadingsMap && userReadingsMap.size > 0) {
      let candidateQuery = client
        .from('books')
        .select('id,author_id,tags', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });

      if (term) candidateQuery = candidateQuery.ilike('title', `%${term}%`);

      const { data, count, error } = await candidateQuery;
      if (error) {
        if (error.code === 'PGRST103' && page > 1) {
          return getBooksResult(search, 1, limit);
        }
        console.error('Catalog query failed', error.code);
        return queryFailure('unavailable', 'Não foi possível carregar o catálogo de livros no momento.');
      }

      const candidateBooks = (data ?? []) as Book[];
      if (!candidateBooks.length) {
        return querySuccess({
          books: [],
          total: count ?? 0,
          page,
          totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
          isPersonalized: false,
        });
      }

      const { rankCatalogBooks } = await import('@/features/recommendations/tensorflow-recommender');
      const rankedBooks = rankCatalogBooks(candidateBooks, userReadingsMap, {
        externalHistoryBooks,
      });

      const total = count ?? rankedBooks.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const pageSlice = rankedBooks.slice(offset, offset + limit);

      if (!pageSlice.length) {
        return querySuccess({
          books: [],
          total,
          page,
          totalPages,
          isPersonalized: true,
        });
      }

      const pageIds = pageSlice.map((b) => b.id);
      const { data: fullBooksData, error: fullError } = await client
        .from('books')
        .select(FULL_BOOK_COLUMNS)
        .in('id', pageIds);

      if (fullError) {
        console.error('Catalog full books query failed', fullError.code);
        return queryFailure('unavailable', 'Não foi possível carregar os detalhes dos livros.');
      }

      const fullBooks = (fullBooksData ?? []) as Book[];
      const authorIds = Array.from(new Set(fullBooks.map((b) => b.author_id).filter(Boolean)));
      const { data: authors } = authorIds.length
        ? await client.from('authors').select('id,name').in('id', authorIds)
        : { data: [] };

      const authorMap = new Map((authors ?? []).map((a) => [a.id, a.name]));
      const fullBooksMap = new Map(fullBooks.map((b) => [b.id, b]));

      const paginatedBooks: Book[] = pageSlice.flatMap((rankedItem) => {
        const fullBook = fullBooksMap.get(rankedItem.id);
        if (!fullBook) return [];
        return [
          {
            ...fullBook,
            authors: { name: authorMap.get(fullBook.author_id) ?? 'Autor(a)' },
            readingStatus: rankedItem.readingStatus,
            isRecommended: rankedItem.isRecommended,
            recommendationScore: rankedItem.recommendationScore,
          },
        ];
      });

      return querySuccess({
        books: paginatedBooks,
        total,
        page,
        totalPages,
        isPersonalized: true,
      });
    }

    let query = client
      .from('books')
      .select(FULL_BOOK_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true });

    if (term) query = query.ilike('title', `%${term}%`);
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) {
      if (error.code === 'PGRST103' && page > 1) {
        return getBooksResult(search, 1, limit);
      }
      console.error('Catalog query failed', error.code);
      return queryFailure('unavailable', 'Não foi possível carregar o catálogo de livros no momento.');
    }

    const books = (data ?? []) as Book[];
    if (!books.length) {
      return querySuccess({
        books: [],
        total: count ?? 0,
        page,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
        isPersonalized: false,
      });
    }

    const authorIds = Array.from(new Set(books.map((b) => b.author_id).filter(Boolean)));
    const { data: authors } = authorIds.length
      ? await client.from('authors').select('id,name').in('id', authorIds)
      : { data: [] };

    const byId = new Map((authors ?? []).map((author) => [author.id, author.name]));
    const booksWithAuthors = books.map((book) => ({
      ...book,
      authors: { name: byId.get(book.author_id) ?? 'Autor(a)' },
    }));

    const total = count ?? books.length;
    return querySuccess({
      books: booksWithAuthors,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      isPersonalized: false,
    });
  },
);

export const getBooks = cache(async (search?: string): Promise<Book[]> => {
  const result = await getBooksResult(search, 1, 36);
  return result.ok ? result.data.books : [];
});

export const getBook = cache(async (slug: string) => {
  const client = await createServerSupabase();
  const { data, error } = await client.from('books').select('id,title,slug,author_id,cover_url,isbn13,language,synopsis,total_chapters,total_pages,publication_year,tags,amazon_url,publisher,translator,publication_date,content_rating,edition_number,format,width_mm,height_mm,depth_mm').eq('slug', slug).maybeSingle();
  if (error || !data) return null;
  const book = data as Book;
  const { data: claims } = await client.auth.getClaims();
  const readerId = typeof claims?.claims?.sub === 'string' ? claims.claims.sub : null;
  const [author, seasons, warnings, readerLists] = await Promise.all([
    client.from('authors').select('name,bio,website_url,instagram').eq('id', book.author_id).maybeSingle(),
    client.from('seasons').select('id,number,title,slug,book_id,status,description,starts_at,ends_at,cover_url').eq('book_id', book.id).order('number', { ascending: true }),
    client.from('book_content_warnings').select('severity,is_community,warning:content_warnings(label,description)').eq('book_id', book.id).limit(24),
    readerId ? client.from('reading_lists').select('id,title').eq('owner_id', readerId).order('updated_at', { ascending: false }).limit(30) : Promise.resolve({ data: [], error: null }),
  ]);
  const warningRows = (warnings.data ?? []) as unknown as { severity: string; is_community: boolean; warning: { label: string; description: string | null } | null }[];
  return { ...book, authors: author.data, seasons: (seasons.data ?? []) as Season[], warnings: warningRows.flatMap((row) => row.warning ? [{ label: row.warning.label, description: row.warning.description, severity: row.severity, is_community: row.is_community }] : []), readerLists: (readerLists.data ?? []) as { id: string; title: string }[], signedIn: Boolean(readerId) };
});

export const getSeason = cache(async (slug: string) => {
  const client = await createServerSupabase();
  const { data: season, error } = await client.from('seasons').select('id,number,title,slug,book_id,status,description,starts_at,ends_at,cover_url').eq('slug', slug).maybeSingle();
  if (error || !season || !['active', 'finished'].includes(season.status)) return null;
  const { data: claims } = await client.auth.getClaims();
  const readerId = typeof claims?.claims?.sub === 'string' ? claims.claims.sub : null;
  const [book, chapterResult, accessResult, milestoneResult, progressResult] = await Promise.all([
    client.from('books').select('id,title,slug,cover_url,author_id').eq('id', season.book_id).maybeSingle(),
    client.from('chapters').select('id,season_id,number,title,reading_range,youtube_url,summary,published_at').eq('season_id', season.id).or(`published_at.is.null,published_at.lte.${new Date().toISOString()}`).order('number', { ascending: true }),
    client.rpc('get_season_chapter_access', { p_season: season.id }),
    client.from('milestones').select('id,title,description,chapter_from,chapter_to,target_date').eq('season_id', season.id).order('position', { ascending: true }).limit(24),
    readerId ? client.rpc('get_user_milestone_status', { p_user: readerId, p_season_id: season.id }) : Promise.resolve({ data: [], error: null }),
  ]);
  const completed = new Map((progressResult.data ?? []).map((row: { milestone_id: string; completed: boolean }) => [row.milestone_id, row.completed]));
  const milestones = ((milestoneResult.data ?? []) as Omit<SeasonMilestone, 'completed'>[]).map((milestone) => ({ ...milestone, completed: completed.get(milestone.id) === true }));
  return { season: season as Season, book: book.data, chapters: (chapterResult.data ?? []) as Chapter[], chapterAccess: (accessResult.data ?? []) as ChapterAccess[], milestones };
});

export type ActiveSeasonInfo = {
  season: Season;
  book: { id: string; title: string; slug: string; cover_url: string | null; total_chapters: number | null; total_pages: number | null } | null;
  totalChapters: number;
  publishedChapters: number;
  nextMeeting?: Meeting | null;
};

export const getActiveSeason = cache(async (): Promise<ActiveSeasonInfo | null> => {
  const client = await createServerSupabase();
  const { data: season, error } = await client
    .from('seasons')
    .select('id,number,title,slug,book_id,status,description,starts_at,ends_at,cover_url')
    .eq('status', 'active')
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !season) return null;

  const [bookResult, chaptersResult] = await Promise.all([
    client.from('books').select('id,title,slug,cover_url,total_chapters,total_pages').eq('id', season.book_id).maybeSingle(),
    client.from('chapters').select('id,number,published_at').eq('season_id', season.id).order('number', { ascending: true }),
  ]);

  const chapters = chaptersResult.data ?? [];
  const chapterIds = chapters.map((c) => c.id);
  const now = Date.now();
  const nowIso = new Date().toISOString();

  const meetingsResult = chapterIds.length
    ? await client
        .from('meetings')
        .select('id,chapter_id,title,status,kind,scheduled_at,duration_min,meeting_url,location,agenda')
        .in('status', ['scheduled', 'live'])
        .in('chapter_id', chapterIds)
        .gte('scheduled_at', nowIso)
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const published = chapters.filter((c) => !c.published_at || Date.parse(c.published_at) <= now).length;

  return {
    season: season as Season,
    book: bookResult.data,
    totalChapters: Math.max(bookResult.data?.total_chapters ?? 0, chapters.length),
    publishedChapters: published,
    nextMeeting: (meetingsResult.data as Meeting | null) ?? null,
  };
});

export const getUpcomingMeetings = cache(async (limit: number = 6): Promise<Meeting[]> => {
  const client = await createServerSupabase();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from('meetings')
    .select('id,chapter_id,title,status,kind,scheduled_at,duration_min,meeting_url,location,agenda')
    .in('status', ['scheduled', 'live'])
    .gte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Upcoming meetings query failed', error.code);
    return [];
  }
  return (data ?? []) as Meeting[];
});

export const getMeetings = cache(async (): Promise<Meeting[]> => {
  const client = await createServerSupabase();
  const now = new Date().toISOString();
  const [upcomingResult, pastResult] = await Promise.all([
    client
      .from('meetings')
      .select(
        'id,chapter_id,book_id,club_id,title,status,kind,scheduled_at,duration_min,meeting_url,location,agenda,spoiler_policy,version,books(id,slug,title),user_clubs(id,slug,name)',
      )
      .gte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(30),
    client
      .from('meetings')
      .select(
        'id,chapter_id,book_id,club_id,title,status,kind,scheduled_at,duration_min,meeting_url,location,agenda,spoiler_policy,version,books(id,slug,title),user_clubs(id,slug,name)',
      )
      .lt('scheduled_at', now)
      .order('scheduled_at', { ascending: false })
      .limit(20),
  ]);

  if (upcomingResult.error) {
    console.error('Upcoming meetings query failed', upcomingResult.error.code);
  }
  if (pastResult.error) {
    console.error('Past meetings query failed', pastResult.error.code);
  }

  const upcoming = (upcomingResult.data ?? []) as unknown as Meeting[];
  const past = (pastResult.data ?? []) as unknown as Meeting[];
  return [...upcoming, ...past];
});

export const getChapters = cache(async (id: string) => {
  const client = await createServerSupabase();
  const [{ data: chapter, error }, { data: claims }] = await Promise.all([
    client.from('chapters').select('id,season_id,number,title,reading_range,youtube_url,summary,published_at').eq('id', id).maybeSingle(),
    client.auth.getClaims(),
  ]);
  if (error || !chapter || (chapter.published_at && Date.parse(chapter.published_at) > Date.now())) {
    const { data: access } = await client.rpc('get_chapter_access', { p_chapter: id });
    const locked = access?.[0];
    if (locked && locked.requires_quiz && !locked.can_open) return { locked: true as const, access: locked, signedIn: typeof claims?.claims?.sub === 'string' };
    return null;
  }
  const [season, comments, progress, chapterList, accessResult, meetings, questions, hostPrompt, hostPromptResult, hostPromptVote] = await Promise.all([
    client.from('seasons').select('id,number,title,slug,book_id,status').eq('id', chapter.season_id).maybeSingle(),
    client.from('v_comments_visible').select('id,chapter_id,user_id,content,is_spoiler,is_locked,created_at').eq('chapter_id', id).order('created_at', { ascending: true }).limit(50),
    claims?.claims?.sub ? client.from('user_progress').select('status,percent').eq('user_id', String(claims.claims.sub)).eq('chapter_id', id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    client.from('chapters').select('id,number,title,published_at').eq('season_id', chapter.season_id).or(`published_at.is.null,published_at.lte.${new Date().toISOString()}`).order('number', { ascending: true }),
    client.rpc('get_season_chapter_access', { p_season: chapter.season_id }),
    client.from('meetings').select('id,chapter_id,title,status,scheduled_at,duration_min,meeting_url,agenda').eq('chapter_id', id).order('scheduled_at', { ascending: false }).limit(1).maybeSingle(),
    claims?.claims?.sub ? client.from('v_quiz_questions_public').select('id,chapter_id,position,question,options').eq('chapter_id', id).order('position', { ascending: true }).limit(50) : Promise.resolve({ data: [], error: null }),
    client.from('host_prompts').select('id,question,options').eq('chapter_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    client.from('v_host_prompt_results').select('prompt_id,question,options,option_0_count,option_1_count,option_2_count,total_votes').eq('chapter_id', id).limit(1).maybeSingle(),
    claims?.claims?.sub ? client.from('host_prompt_votes').select('prompt_id,option_idx').eq('user_id', String(claims.claims.sub)).limit(100) : Promise.resolve({ data: [], error: null }),
  ]);
  if (!season.data || !['active', 'finished'].includes(season.data.status)) return null;
  const book = season.data ? await client.from('books').select('id,title,slug,cover_url,author_id').eq('id', season.data.book_id).maybeSingle() : { data: null };
  const ordered = (chapterList.data ?? []).filter((item) => !item.published_at || Date.parse(item.published_at) <= Date.now());
  const accessRows = (accessResult.data ?? []) as ChapterAccess[];
  const navigationRows = accessRows.length ? accessRows.slice().sort((a, b) => a.chapter_number - b.chapter_number) : ordered.map((item) => ({ chapter_id: item.id, chapter_number: item.number, chapter_title: item.title, reading_range: null, published_at: item.published_at, can_open: true, requires_quiz: false }));
  const navIndex = navigationRows.findIndex((item) => item.chapter_id === chapter.id);
  const previousAccessible = ordered.findIndex((item) => item.id === chapter.id);
  const previousRow = navIndex > 0 ? navigationRows[navIndex - 1] : null;
  const nextRow = navIndex >= 0 && navIndex < navigationRows.length - 1 ? navigationRows[navIndex + 1] : null;
  const previous = previousAccessible > 0 ? ordered[previousAccessible - 1] : previousRow?.can_open ? { id: previousRow.chapter_id, number: previousRow.chapter_number, title: previousRow.chapter_title, published_at: previousRow.published_at } : null;
  const next: ChapterNavigation | null = nextRow ? { id: nextRow.chapter_id, number: nextRow.chapter_number, title: nextRow.chapter_title, published_at: nextRow.published_at, canOpen: nextRow.can_open } : null;
  return {
    chapter: chapter as Chapter,
    season: season.data,
    book: book.data,
    comments: comments.data ?? [],
    progress: progress.data,
    previous,
    next,
    meeting: meetings.data,
    questions: questions.data ?? [],
    hostPrompt: hostPrompt.data ? { id: hostPrompt.data.id, question: hostPrompt.data.question, options: Array.isArray(hostPrompt.data.options) ? hostPrompt.data.options.filter((option): option is string => typeof option === 'string').slice(0, 3) : [] } : null,
    hostPromptResult: hostPromptResult.data ? { counts: [hostPromptResult.data.option_0_count ?? 0, hostPromptResult.data.option_1_count ?? 0, hostPromptResult.data.option_2_count ?? 0], total: hostPromptResult.data.total_votes ?? 0 } : null,
    hostPromptVote: hostPromptVote.data?.find((vote) => vote.prompt_id === hostPrompt.data?.id)?.option_idx ?? null,
    signedIn: typeof claims?.claims?.sub === 'string',
    viewerId: typeof claims?.claims?.sub === 'string' ? claims.claims.sub : null,
  };
});
