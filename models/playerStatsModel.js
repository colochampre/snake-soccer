import pool from "../config/db.js";

// XP required to go from level N to level N+1
export const getXpToNextLevel = (level) => {
    return 100 * Math.pow(level, 2) + 200 * level + 200;
    // Level 1->2: 500, Level 2->3: 800, Level 3->4: 1100, etc.
};

// Get current XP within level (xp column now stores XP within current level, not total)
export const getCurrentLevelXp = (xp) => {
    return xp; // XP is now stored as progress within current level
};

const playerStatsModel = {
    getOrCreate: async (userId) => {
        try {
            const [rows] = await pool.query(
                "SELECT * FROM player_stats WHERE user_id = ?",
                [userId]
            );
            
            if (rows[0]) {
                return rows[0];
            }
            
            await pool.query(
                "INSERT INTO player_stats (user_id) VALUES (?)",
                [userId]
            );
            
            const [newRows] = await pool.query(
                "SELECT * FROM player_stats WHERE user_id = ?",
                [userId]
            );
            return newRows[0];
        } catch (error) {
            throw error;
        }
    },

    getByUserId: async (userId) => {
        try {
            const [rows] = await pool.query(
                "SELECT * FROM player_stats WHERE user_id = ?",
                [userId]
            );
            return rows[0] || null;
        } catch (error) {
            throw error;
        }
    },

    getByUsername: async (username) => {
        try {
            const [rows] = await pool.query(
                `SELECT ps.*, u.username 
                 FROM player_stats ps 
                 JOIN users u ON ps.user_id = u.id 
                 WHERE u.username = ?`,
                [username]
            );
            return rows[0] || null;
        } catch (error) {
            throw error;
        }
    },

    updateStats: async (userId, { goals = 0, assists = 0, isWin = false, isLoss = false, isDraw = false, xpGained = 0 }) => {
        try {
            const stats = await playerStatsModel.getOrCreate(userId);
            
            // XP within current level + new XP gained
            let currentXp = stats.xp + xpGained;
            let currentLevel = stats.level;
            let xpForNextLevel = getXpToNextLevel(currentLevel);
            
            // Level up while we have enough XP (allows multiple level-ups at once)
            while (currentXp >= xpForNextLevel) {
                currentLevel++;
                currentXp -= xpForNextLevel;
                xpForNextLevel = getXpToNextLevel(currentLevel);
            }
            
            await pool.query(
                `UPDATE player_stats SET 
                    goals = goals + ?,
                    assists = assists + ?,
                    matches = matches + 1,
                    wins = wins + ?,
                    losses = losses + ?,
                    draws = draws + ?,
                    xp = ?,
                    level = ?
                WHERE user_id = ?`,
                [
                    goals,
                    assists,
                    isWin ? 1 : 0,
                    isLoss ? 1 : 0,
                    isDraw ? 1 : 0,
                    currentXp,
                    currentLevel,
                    userId
                ]
            );
            
            return { leveledUp: currentLevel > stats.level, newLevel: currentLevel, newXp: currentXp };
        } catch (error) {
            throw error;
        }
    },

    getRanking: async (limit = 50, offset = 0) => {
        try {
            const [rows] = await pool.query(
                `SELECT 
                    ps.*,
                    u.username,
                    CASE WHEN ps.matches > 0 THEN ROUND((ps.wins / ps.matches) * 100, 1) ELSE 0 END as winrate
                FROM player_stats ps
                JOIN users u ON ps.user_id = u.id
                WHERE ps.matches > 0
                ORDER BY ps.level DESC, ps.xp DESC
                LIMIT ? OFFSET ?`,
                [limit, offset]
            );
            return rows;
        } catch (error) {
            throw error;
        }
    },

    getTotalPlayersWithMatches: async () => {
        try {
            const [rows] = await pool.query(
                "SELECT COUNT(*) as total FROM player_stats WHERE matches > 0"
            );
            return rows[0].total;
        } catch (error) {
            throw error;
        }
    },

    getPlayerRank: async (userId) => {
        try {
            const [rows] = await pool.query(
                `SELECT COUNT(*) + 1 AS \`rank\`
                FROM player_stats ps1
                JOIN player_stats ps2 ON ps2.user_id = ?
                WHERE ps1.matches > 0 
                AND (ps1.level > ps2.level OR (ps1.level = ps2.level AND ps1.xp > ps2.xp))`,
                [userId]
            );
            return rows[0].rank;
        } catch (error) {
            throw error;
        }
    }
};

export default playerStatsModel;
