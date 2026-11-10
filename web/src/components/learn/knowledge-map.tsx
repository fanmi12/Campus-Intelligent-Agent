import type { SummaryContent } from "@/lib/learn/schema";
import styles from "./learn.module.css";
import { RichText } from "./source-badges";

// 知识结构图：一级节点是卡片，子节点是小标签，左侧彩色竖线区分；手机上单列，宽屏两列
export function KnowledgeMap({ nodes }: { nodes: SummaryContent["map"] }) {
  return (
    <ul className={styles.map} aria-label="知识结构">
      {nodes.map((node, index) => (
        <li key={index} className={styles.mapNode}>
          <p className={styles.mapLabel}>
            <RichText text={node.label} />
          </p>
          {node.children.length > 0 && (
            <ul className={styles.mapChildren}>
              {node.children.map((child, childIndex) => (
                <li key={childIndex} className={styles.mapChip}>
                  <RichText text={child} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
