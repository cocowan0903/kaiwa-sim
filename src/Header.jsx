import React from "react";

import React from "react";

export default function Header() {
  return (
    <header className="appHeader" role="banner">
      <div className="appHeaderInner">
        <div className="appHeaderLeft">
          <a className="headerLink" href="#/">
            条件
          </a>
        </div>

        <div className="appHeaderCenter">
          <div className="appHeaderTitle">Decision Router</div>
          <div className="appHeaderSub">条件 → 生成 → 行動</div>
        </div>

        <div className="appHeaderRight">
          <a className="headerLink" href="#/result">
            結果
          </a>
        </div>
      </div>
    </header>
  );
}
