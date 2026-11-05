# 教学材料选编与来源索引

七份文件已登记为五部教材与一份勘误；两份高级计量第二版共用书目。当前接入的是经选页核对的自编教学卡与来源索引，不是原书全文数据库。原书、扫描页和本机路径不发布，也不发给模型。未知版本或未审阅章节不充当已核实依据。

## 高级计量经济学及Stata应用

- 书目ID：chen_advanced_2
- 作者：陈强；版本：2014年第二版
- 书中Stata12；当前操作以Stata18帮助为准
- 文件：2份；PDF页数：694、694
- 已接入卡：textbook_ols_assumptions、textbook_unbalanced、textbook_significance
- 所列正文页已核对；自编教学表述仍待教师审阅

## 计量经济学及Stata应用

- 书目ID：chen_basic_1
- 作者：陈强；版本：2015年第一版
- 当前操作以Stata18帮助为准
- 文件：1份；PDF页数：360
- 已接入卡：textbook_variables、textbook_units、textbook_within、textbook_interpret
- 所列正文页已核对；自编教学表述仍待教师审阅

## Stata统计分析从入门到精通

- 书目ID：yang_stata_1
- 作者：杨维忠、张甜；版本：2022年第一版
- 书中Stata16；当前操作以Stata18帮助为准
- 文件：1份；PDF页数：765
- 已接入卡：textbook_question、textbook_variables、textbook_regress、textbook_panel、textbook_within
- 所列正文页已核对；自编教学表述仍待教师审阅

## 因果推断实用计量方法

- 书目ID：qiu_causal
- 作者：邱嘉平；版本：版次未核实
- 用于DID直觉，不替代同批多时期模型规范
- 文件：1份；PDF页数：343
- 已接入卡：textbook_did
- 所列正文页已核对；自编教学表述仍待教师审阅

## STATA实用教程

- 书目ID：wang_stata_1
- 作者：王天夫、李博柏；版本：2008年第一版
- 书中Stata10；旧导入命令不作为当前默认语法
- 文件：1份；PDF页数：466
- 已接入卡：textbook_labels、textbook_dofile、textbook_paths
- 所列正文页已核对；自编教学表述仍待教师审阅

## 教材勘误表—计量经济学及Stata应用

- 书目ID：chen_basic_errata
- 作者：陈强；版本：2017-03-08
- 只对匹配版本核对；不套用到高级计量教材
- 文件：1份；PDF页数：2
- 已接入卡：textbook_errata
- 所列正文页已核对；自编教学表述仍待教师审阅

# 自编教学卡

## 把研究方向变成一个问题

- ID：textbook_question
- 适用步骤：prepare
- 所列页已逐页核对；自编表述，尚待教学审校
- 杨维忠、张甜《Stata统计分析从入门到精通》；2022年第一版；书中软件为Stata16；研究设计；PDF第736页；印刷页未核对（不推算）

## 结果变量与解释变量

- ID：textbook_variables
- 适用步骤：prepare、data、plan
- 所列页已逐页核对；自编表述，尚待教学审校
- 陈强《计量经济学及Stata应用》；2015年第一版；360页PDF；4.1：一元线性回归模型；PDF第70页；印刷页59
- 杨维忠、张甜《Stata统计分析从入门到精通》；2022年第一版；书中软件为Stata16；线性回归与regress；PDF第239页；印刷页未核对（不推算）

## 未知单位也能先核对回归

- ID：textbook_units
- 适用步骤：prepare、data、plan、explain
- 所列页已逐页核对；自编表述，尚待教学审校
- 陈强《计量经济学及Stata应用》；2015年第一版；360页PDF；9.11：变量量级与单位选择；PDF第202页；印刷页191

## 读懂 regress 主命令

- ID：textbook_regress
- 适用步骤：plan、execute
- 所列页已逐页核对；自编表述，尚待教学审校
- 杨维忠、张甜《Stata统计分析从入门到精通》；2022年第一版；书中软件为Stata16；线性回归与regress；PDF第239页；印刷页未核对（不推算）
- StataCorp《Stata18 本机帮助：regress、xtset、xtreg》；Stata18；命令帮助与方差估计选项

## 为什么面板要有对象与时间

- ID：textbook_panel
- 适用步骤：data、health、plan
- 所列页已逐页核对；自编表述，尚待教学审校
- 杨维忠、张甜《Stata统计分析从入门到精通》；2022年第一版；书中软件为Stata16；面板数据声明；PDF第653页；印刷页未核对（不推算）
- 杨维忠、张甜《Stata统计分析从入门到精通》；2022年第一版；书中软件为Stata16；面板数据声明；PDF第654页；印刷页未核对（不推算）
- StataCorp《Stata18 本机帮助：regress、xtset、xtreg》；Stata18；命令帮助与方差估计选项

## 固定效应在比较什么

- ID：textbook_within
- 适用步骤：plan、explain
- 所列页已逐页核对；自编表述，尚待教学审校
- 陈强《计量经济学及Stata应用》；2015年第一版；360页PDF；12.4：组内固定效应估计；PDF第247页；印刷页236
- 杨维忠、张甜《Stata统计分析从入门到精通》；2022年第一版；书中软件为Stata16；固定效应xtreg, fe；PDF第663页；印刷页未核对（不推算）

## DID：比较变化的差异

- ID：textbook_did
- 适用步骤：prepare、plan、explain
- 所列页已逐页核对；自编表述，尚待教学审校
- 邱嘉平《因果推断实用计量方法》；所提供343页PDF；版次未核实；第9章第2节：双重差分的直观理解；PDF第242页；印刷页233

## 标准误要与估计器一起读

- ID：textbook_variance
- 适用步骤：plan、execute、explain
- 所列页已逐页核对；自编表述，尚待教学审校
- StataCorp《Stata18 本机帮助：regress、xtset、xtreg》；Stata18；命令帮助与方差估计选项

## 输入行数不等于估计样本

- ID：textbook_sample
- 适用步骤：health、execute、explain
- 所列页已逐页核对；自编表述，尚待教学审校
- StataCorp《Stata18 本机帮助：regress、xtset、xtreg》；Stata18；命令帮助与方差估计选项

## 从真实结果开始解释

- ID：textbook_interpret
- 适用步骤：explain、reports
- 所列页已逐页核对；自编表述，尚待教学审校
- 陈强《计量经济学及Stata应用》；2015年第一版；360页PDF；4.1：模型及误差项；PDF第70页；印刷页59
- StataCorp《Stata18 本机帮助：regress、xtset、xtreg》；Stata18；命令帮助与方差估计选项

## 数值编码、标签和单位分别看

- ID：textbook_labels
- 适用步骤：data、health
- 所列页已逐页核对；自编表述，尚待教学审校
- 王天夫、李博柏《STATA实用教程》；2008年第一版；软件Stata10；4.1：变量值标签及显示原始编码；PDF第115页；印刷页86

## do文件：把操作保存为可重复步骤

- ID：textbook_dofile
- 适用步骤：data、execute
- 所列页已逐页核对；自编表述，尚待教学审校
- 王天夫、李博柏《STATA实用教程》；2008年第一版；软件Stata10；5.3：运行命令程序文件；PDF第183页；印刷页154

## 工作目录与找不到文件

- ID：textbook_paths
- 适用步骤：data、execute
- 所列页已逐页核对；自编表述，尚待教学审校
- 王天夫、李博柏《STATA实用教程》；2008年第一版；软件Stata10；1.2：Stata工作目录与程序文件位置；PDF第34页；印刷页5

## 控制其他因素后，系数说明什么

- ID：textbook_ols_assumptions
- 适用步骤：plan、explain
- 所列页已逐页核对；自编表述，尚待教学审校
- 陈强《高级计量经济学及Stata应用》；2014年第二版；694页PDF，两份文件共用书目；3.1：古典线性回归模型的假定；PDF第28页；印刷页13

## 非平衡面板并不等于数据错误

- ID：textbook_unbalanced
- 适用步骤：health、plan
- 所列页已逐页核对；自编表述，尚待教学审校
- 陈强《高级计量经济学及Stata应用》；2014年第二版；694页PDF，两份文件共用书目；15.1：面板数据的特点；PDF第265页；印刷页250

## 显著性水平与置信区间不是因果证明

- ID：textbook_significance
- 适用步骤：explain、reports
- 所列页已逐页核对；自编表述，尚待教学审校
- 陈强《高级计量经济学及Stata应用》；2014年第二版；694页PDF，两份文件共用书目；3.6：对单个系数的t检验；PDF第35页；印刷页20

## 先核对版本，再使用教材勘误

- ID：textbook_errata
- 适用步骤：prepare、reports
- 所列页已逐页核对；自编表述，尚待教学审校
- 陈强《教材勘误表—计量经济学及Stata应用》；2017-03-08；勘误说明；适用教材需核对；PDF第1页；印刷页未核对（不推算）
