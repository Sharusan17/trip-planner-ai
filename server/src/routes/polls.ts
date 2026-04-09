import { Router, Request, Response } from 'express';
import pool from '../db/pool';

const router = Router();

// GET /trips/:tripId/polls?traveller_id=xxx
router.get('/trips/:tripId/polls', async (req: Request, res: Response) => {
  try {
    const { traveller_id } = req.query;

    const pollsResult = await pool.query(
      `SELECT p.*, t.name AS created_by_name, t.avatar_colour AS created_by_colour
       FROM polls p
       JOIN travellers t ON t.id = p.created_by
       WHERE p.trip_id = $1
       ORDER BY p.created_at DESC`,
      [req.params.tripId]
    );

    const polls = await Promise.all(
      pollsResult.rows.map(async (poll) => {
        // Get options with vote counts
        const optionsResult = await pool.query(
          `SELECT po.id, po.poll_id, po.text, po.sort_order,
                  COUNT(pv.id)::INT AS vote_count
           FROM poll_options po
           LEFT JOIN poll_votes pv ON pv.option_id = po.id
           WHERE po.poll_id = $1
           GROUP BY po.id
           ORDER BY po.sort_order`,
          [poll.id]
        );

        // Get this traveller's vote if provided
        let myVoteOptionId: string | null = null;
        if (traveller_id) {
          const voteResult = await pool.query(
            `SELECT option_id FROM poll_votes WHERE poll_id = $1 AND traveller_id = $2`,
            [poll.id, traveller_id]
          );
          myVoteOptionId = voteResult.rows[0]?.option_id ?? null;
        }

        const totalVotes = optionsResult.rows.reduce((s: number, o: any) => s + o.vote_count, 0);

        return {
          ...poll,
          options: optionsResult.rows,
          my_vote_option_id: myVoteOptionId,
          total_votes: totalVotes,
        };
      })
    );

    res.json(polls);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /trips/:tripId/polls
router.post('/trips/:tripId/polls', async (req: Request, res: Response) => {
  try {
    const { question, options, created_by, closes_at } = req.body;

    const pollResult = await pool.query(
      `INSERT INTO polls (trip_id, created_by, question, closes_at)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.tripId, created_by, question, closes_at ?? null]
    );
    const poll = pollResult.rows[0];

    // Insert options
    for (let i = 0; i < options.length; i++) {
      await pool.query(
        `INSERT INTO poll_options (poll_id, text, sort_order) VALUES ($1, $2, $3)`,
        [poll.id, options[i], i]
      );
    }

    const traveller = await pool.query(
      `SELECT name, avatar_colour FROM travellers WHERE id = $1`,
      [created_by]
    );

    const optionsResult = await pool.query(
      `SELECT id, poll_id, text, sort_order, 0 AS vote_count
       FROM poll_options WHERE poll_id = $1 ORDER BY sort_order`,
      [poll.id]
    );

    res.status(201).json({
      ...poll,
      created_by_name: traveller.rows[0]?.name,
      created_by_colour: traveller.rows[0]?.avatar_colour,
      options: optionsResult.rows,
      my_vote_option_id: null,
      total_votes: 0,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /polls/:pollId/vote
router.post('/polls/:pollId/vote', async (req: Request, res: Response) => {
  try {
    const { option_id, traveller_id } = req.body;

    // Upsert vote (one vote per traveller per poll)
    await pool.query(
      `INSERT INTO poll_votes (poll_id, option_id, traveller_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (poll_id, traveller_id) DO UPDATE SET option_id = EXCLUDED.option_id`,
      [req.params.pollId, option_id, traveller_id]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /polls/:id
router.delete('/polls/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM polls WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
