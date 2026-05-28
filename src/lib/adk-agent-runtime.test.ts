import { describe, expect, it } from "vitest";

import { analyzeRunWithAdkRuntime, buildSignalClusters } from "./adk-agent-runtime";
import type { SignalGenRun } from "./types";

function makeRun(comments: string[]): SignalGenRun {
  return {
    _id: "run-sample",
    source: "dashboard_upload",
    status: "uploaded",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    screenshotNames: ["feedback.png"],
    comments,
    signal: {
      title: "",
      summary: "",
      confidence: 0,
      evidence: [],
    },
    plan: {
      recommendedChange: "",
      filesToChange: [],
      guardrails: [],
      acceptanceCriteria: [],
    },
  };
}

describe("buildSignalClusters", () => {
  it("keeps distinct feature requests from one screenshot as separate signals", () => {
    const clusters = buildSignalClusters([
      "能不能直接帮我把简历投了",
      "非常好的网站 非常好的idea 解决痛点",
      "UI有点丑呀",
      "姐 简历有没有其他 format type 可以选择? 超喜欢你的网站 save my life",
      "哇啊啊啊感谢反馈！这就搞等我！",
    ]);

    expect(clusters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "feature_request", title: "Direct resume submission", evidenceCommentIds: ["comment-1"] }),
        expect.objectContaining({ type: "feature_request", title: "Additional resume format options", evidenceCommentIds: ["comment-4"] }),
        expect.objectContaining({ type: "friction", title: "UI visual polish concern", evidenceCommentIds: ["comment-3"] }),
      ]),
    );
    expect(clusters.filter((cluster) => cluster.type === "feature_request")).toHaveLength(2);
  });

  it("splits multiple atomic asks from one extracted comment without resume false positives", () => {
    const clusters = buildSignalClusters([
      "Can you submit my resume directly and let me choose PDF or DOCX format types? Need the UI to be less ugly too.",
      "Need dashboard filters by type.",
    ]);

    expect(clusters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "feature_request", title: "Direct resume submission", evidenceCommentIds: ["comment-1"] }),
        expect.objectContaining({ type: "feature_request", title: "Additional resume format options", evidenceCommentIds: ["comment-1"] }),
        expect.objectContaining({ type: "friction", title: "UI visual polish concern", evidenceCommentIds: ["comment-1"] }),
        expect.objectContaining({ type: "feature_request", title: "Repeated feature request detected", evidenceCommentIds: ["comment-2"] }),
      ]),
    );
  });

  it("stores the analyzed run with multiple signal clusters instead of only the top signal", () => {
    const update = analyzeRunWithAdkRuntime(
      makeRun([
        "能不能直接帮我把简历投了",
        "UI有点丑呀",
        "姐 简历有没有其他 format type 可以选择?",
      ]),
    );

    expect(update.signalClusters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Direct resume submission" }),
        expect.objectContaining({ title: "Additional resume format options" }),
        expect.objectContaining({ title: "UI visual polish concern" }),
      ]),
    );
  });
});
