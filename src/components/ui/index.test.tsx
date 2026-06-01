import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button, Tab, Tabs } from ".";

describe("Soft Studio UI primitives", () => {
  it("renders Button as an anchor when href is provided", () => {
    const markup = renderToStaticMarkup(
      <Button href="/dashboard" variant="rose" size="lg">
        Open dashboard
      </Button>,
    );

    expect(markup).toContain("<a");
    expect(markup).toContain('href="/dashboard"');
    expect(markup).toContain("sg-btn--rose");
    expect(markup).toContain("sg-btn--lg");
  });

  it("renders Button as a disabled button while loading", () => {
    const markup = renderToStaticMarkup(<Button loading>Saving</Button>);

    expect(markup).toContain("<button");
    expect(markup).toContain("disabled");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("sg-spin");
  });

  it("sets segmented tab roles and aria-selected state", () => {
    const markup = renderToStaticMarkup(
      <Tabs>
        <Tab selected>Signals</Tab>
        <Tab>Plans</Tab>
      </Tabs>,
    );

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('role="tab"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('aria-selected="false"');
  });
});
