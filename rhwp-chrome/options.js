// options.html 로직 (외부 스크립트)
(function() {
  'use strict';

  const generalInputs = ['autoOpen', 'showBadges', 'hoverPreview'];

  function showSaved() {
    const saved = document.getElementById('saved');
    saved.classList.add('show');
    setTimeout(function() { saved.classList.remove('show'); }, 1500);
  }

  // 설정 로드
  function loadSettings() {
    var settings = { autoOpen: true, showBadges: true, hoverPreview: true, aiModel: 'gpt-4o', aiApiKey: '' };
    try {
      chrome.storage.sync.get(settings, function(data) {
        for (var i = 0; i < generalInputs.length; i++) {
          document.getElementById(generalInputs[i]).checked = data[generalInputs[i]];
        }
        document.getElementById('aiModel').value = data.aiModel || 'gpt-4o';
        document.getElementById('aiApiKey').value = data.aiApiKey || '';
      });
    } catch(e) {
      console.log('Settings load error:', e);
    }
  }

  // 일반 설정 저장
  for (var i = 0; i < generalInputs.length; i++) {
    document.getElementById(generalInputs[i]).addEventListener('change', function() {
      var settings = {};
      for (var j = 0; j < generalInputs.length; j++) {
        settings[generalInputs[j]] = document.getElementById(generalInputs[j]).checked;
      }
      try {
        chrome.storage.sync.set(settings, showSaved);
      } catch(e) {}
    });
  }

  // AI 설정 저장
  function saveAiSettings() {
    try {
      var aiModel = document.getElementById('aiModel').value;
      var aiApiKey = document.getElementById('aiApiKey').value.trim();
      chrome.storage.sync.set({ aiModel: aiModel, aiApiKey: aiApiKey }, showSaved);
    } catch(e) {}
  }

  document.getElementById('aiModel').addEventListener('change', saveAiSettings);
  document.getElementById('aiApiKey').addEventListener('change', saveAiSettings);

  // 연결 테스트
  document.getElementById('btnTestConnection').addEventListener('click', function() {
    var apiKey = document.getElementById('aiApiKey').value.trim();
    var resultDiv = document.getElementById('testResult');
    resultDiv.textContent = '테스트 중...';
    resultDiv.className = 'test-result';

    if (!apiKey) {
      resultDiv.textContent = 'API 키를 입력해주세요.';
      resultDiv.className = 'test-result error';
      return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://api.openai.com/v1/models', true);
    xhr.setRequestHeader('Authorization', 'Bearer ' + apiKey);
    xhr.onload = function() {
      if (xhr.status === 200) {
        resultDiv.textContent = '연결 성공! API 키가 유효합니다.';
        resultDiv.className = 'test-result success';
      } else {
        try {
          var err = JSON.parse(xhr.responseText);
          resultDiv.textContent = '연결 실패: ' + (err.error?.message || xhr.statusText);
        } catch(e) {
          resultDiv.textContent = '연결 실패: ' + xhr.statusText;
        }
        resultDiv.className = 'test-result error';
      }
    };
    xhr.onerror = function() {
      resultDiv.textContent = '네트워크 오류';
      resultDiv.className = 'test-result error';
    };
    xhr.send();
  });

  // API 키 삭제
  document.getElementById('btnClearApiKey').addEventListener('click', function() {
    document.getElementById('aiApiKey').value = '';
    saveAiSettings();
  });

  // 초기화
  loadSettings();
})();