import type { Lesson } from "../schema";
import calculusDerivative from "./calculus-derivative.json";
import dsStackQueue from "./ds-stack-queue.json";
import econSupplyDemand from "./econ-supply-demand.json";
import linearAlgebraGauss from "./linear-algebra-gauss.json";
import linearAlgebraMatrix from "./linear-algebra-matrix.json";
import probabilityBayes from "./probability-bayes.json";

// 精选课程：团队生成并逐页人工核对过的真实课程（以线性代数、高等数学这类学科课为主），学生打开就能学，不用等待生成。
// 课程是静态 JSON，随代码一起发布（id 以 f- 开头，不进数据库）。
//
// 新增或更新一节：
// 1. 在 web/ 下运行 node_modules\.bin\tsx.cmd --env-file=.env.local scripts\learn-featured.ts <slug>
//    （会调用大模型，每节几分钱；校园课还需要先导入过知识库）；
// 2. 逐页核对：学科课检查概念和公式，例题用程序重算一遍；校园课的校内事实要能在对应的 knowledge/ 资料里找到。
//    不符的直接改 JSON 或删掉那个要点；
// 3. 把核对过的 JSON 放在本目录，并在下面登记。
//
// 学科课里的公式写成 $…$（LaTeX 子集，见 lib/learn/math/）、矩阵写成 [[1,2],[3,4]]；需要图像的讲解页在 content.figures
// 里放图像规格（见 lib/learn/figure.ts：函数图、栈和队列、概率树、矩阵乘法演示等）。讲解词是读出来的，不要写公式符号。
// scripts/learn-schema-test.ts 会检查每一页、每个公式、每张图的规格都合格。
//
// 没有精选课程时是空数组，首页不显示「精选课程」。
export const featuredLessons = [
  linearAlgebraMatrix,
  linearAlgebraGauss,
  calculusDerivative,
  probabilityBayes,
  dsStackQueue,
  econSupplyDemand,
] as unknown as Lesson[];
