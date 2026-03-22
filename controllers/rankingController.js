import playerStatsModel, { getXpToNextLevel, getCurrentLevelXp } from "../models/playerStatsModel.js";

const rankingController = {
    getRankingPage: async (req, res) => {
        try {
            const rankings = await playerStatsModel.getRanking(50, 0);
            const userStats = await playerStatsModel.getOrCreate(req.user.id);
            const userRank = userStats.matches > 0 ? await playerStatsModel.getPlayerRank(req.user.id) : null;
            
            const xpToNext = getXpToNextLevel(userStats.level);
            const currentLevelXp = getCurrentLevelXp(userStats.xp);
            
            res.render("ranking", { 
                title: "Rankings - Snake Soccer", 
                user: req.user,
                userStats: {
                    ...userStats,
                    xpToNextLevel: xpToNext,
                    currentLevelXp: currentLevelXp,
                    winrate: userStats.matches > 0 ? Math.round((userStats.wins / userStats.matches) * 100 * 10) / 10 : 0,
                    rank: userRank
                },
                rankings: rankings.map((r, index) => ({
                    ...r,
                    rank: index + 1,
                    xpToNextLevel: getXpToNextLevel(r.level),
                    currentLevelXp: getCurrentLevelXp(r.xp)
                }))
            });
        } catch (error) {
            console.error("Error loading ranking:", error);
            res.status(500).render("error", { message: "Error al cargar el ranking" });
        }
    },

    getApiRanking: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 50, 100);
            const offset = (page - 1) * limit;
            
            const rankings = await playerStatsModel.getRanking(limit, offset);
            const total = await playerStatsModel.getTotalPlayersWithMatches();
            
            res.json({
                rankings: rankings.map((r, index) => ({
                    ...r,
                    rank: offset + index + 1,
                    xpToNextLevel: getXpToNextLevel(r.level),
                    currentLevelXp: getCurrentLevelXp(r.xp)
                })),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            console.error("Error fetching ranking:", error);
            res.status(500).json({ error: "Error al obtener el ranking" });
        }
    },

    getUserStats: async (req, res) => {
        try {
            console.log('getUserStats called for user:', req.user.id, req.user.username);
            const stats = await playerStatsModel.getOrCreate(req.user.id);
            console.log('Stats from DB:', stats);
            const rank = stats.matches > 0 ? await playerStatsModel.getPlayerRank(req.user.id) : null;
            
            const xpToNext = getXpToNextLevel(stats.level);
            const currentLevelXp = getCurrentLevelXp(stats.xp);
            
            const response = {
                ...stats,
                xpToNextLevel: xpToNext,
                currentLevelXp: currentLevelXp,
                winrate: stats.matches > 0 ? Math.round((stats.wins / stats.matches) * 100 * 10) / 10 : 0,
                rank
            };
            console.log('Sending response:', response);
            res.json(response);
        } catch (error) {
            console.error("Error fetching user stats:", error);
            res.status(500).json({ error: "Error al obtener estadísticas" });
        }
    }
};

export default rankingController;
