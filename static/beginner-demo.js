const reveal = document.querySelector('#revealResult');
const resultCard = document.querySelector('#resultCard');
const feedback = document.querySelector('#quizFeedback');
const answers = [...document.querySelectorAll('[data-answer]')];

reveal?.addEventListener('click', () => {
  resultCard.hidden = false;
  reveal.hidden = true;
  resultCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

for (const button of answers) {
  button.addEventListener('click', () => {
    for (const item of answers) item.setAttribute('aria-pressed', String(item === button));
    if (button.dataset.answer === 'yes') {
      feedback.className = 'quiz-feedback bad';
      feedback.textContent = '这个判断太快了。系数为正只说明在这份模拟数据和当前模型下存在正相关；遗漏变量、反向因果和模型设定都可能影响结论，不能直接说“多读书一定导致收入更高”。';
    } else {
      feedback.className = 'quiz-feedback ok';
      feedback.textContent = '判断正确。这个系数说明的是关联，不是因果证明。要讨论因果，还需要研究设计、识别假设和数据来源。';
    }
  });
}
