import express from "express";
import rankingController from "../controllers/rankingController.js";
import auth from "../middlewares/auth.js";

const router = express.Router();

router.get("/ranking", auth.requireAuth, rankingController.getRankingPage);
router.get("/api/ranking", auth.requireAuth, rankingController.getApiRanking);
router.get("/api/user/stats", auth.requireAuth, rankingController.getUserStats);

export default router;
