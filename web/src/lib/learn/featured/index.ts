import type { Lesson } from "../schema";

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
// 没有精选课程时是空数组，首页不显示「精选课程」。
export const featuredLessons: Lesson[] = [];
