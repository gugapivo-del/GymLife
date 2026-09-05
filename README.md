# Cutting Tracker

Painel web para acompanhamento pessoal de cutting, com:

- login por e-mail e senha;
- sincronização entre dispositivos usando Firebase Authentication + Cloud Firestore;
- registro diário de peso, água, calorias, proteína, cardio, passos, sono e energia;
- checkboxes para treino, dieta, cardio e sono;
- metas semanais com checklist;
- gráfico de evolução do peso;
- painel de hidratação;
- histórico com edição;
- exportação de backup em JSON;
- tema escuro/claro;
- modo local para testar a interface antes de configurar o Firebase.

## 1. Criar o projeto Firebase

No Firebase Console:

1. Crie um projeto.
2. Registre um aplicativo Web.
3. Em Authentication, ative o provedor **Email/Password**.
4. Crie um banco **Cloud Firestore**.
5. Copie a configuração do app Web para `firebaseConfig.js`.
6. Publique as regras de `firestore.rules` na aba Rules do Firestore.

A documentação oficial recomenda o uso do Firebase Authentication junto com regras do Firestore para restringir os dados por usuário.

## 2. Configurar

Abra `firebaseConfig.js` e troque os placeholders pelos valores reais do seu aplicativo Web Firebase.

Não coloque chaves privadas ou credenciais de servidor nesse arquivo. O objeto de configuração Web do Firebase é feito para o cliente; a proteção dos dados vem das regras de segurança e da autenticação.

## 3. Rodar localmente

Não abra o `index.html` com duplo clique se o navegador bloquear módulos ES. Use um servidor local, por exemplo:

```bash
python -m http.server 5500
```

Depois abra:

```text
http://localhost:5500
```

Também pode usar o Live Server no VS Code.

## 4. Publicar

O projeto é estático. Pode ser publicado em GitHub Pages, Firebase Hosting, Netlify ou outro serviço de hospedagem estática.

## Estrutura

- `index.html` — interface
- `style.css` — estilo responsivo
- `app.js` — lógica, autenticação, Firestore e gráficos
- `firebaseConfig.js` — configuração do seu projeto Firebase
- `firestore.rules` — regras de segurança
