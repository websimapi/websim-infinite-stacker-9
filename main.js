import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { setupScene } from './setup.js';
import { UIManager } from './ui.js';
import { Game } from './game.js';
import { ReplayRecorder } from './replay.js';
import { CanvasUI } from './canvas-ui.js';
import { WebsimSocket } from '@websim/socket';

// Global state
let game, ui, replayRecorder, canvasUI;
let scene, world, camera, renderer, uiScene, uiCamera;
let room, finalScore = 0;

let leaderboardScores = [];
let leaderboardPage = 1;
const LEADERBOARD_PAGE_SIZE = 10;
let unsubscribeScores = () => {};

function init() {
    const {
        scene: s,
        world: w,
        camera: c,
        renderer: r,
        defaultMaterial: dm,
        uiScene: us,
        uiCamera: uc
    } = setupScene();
    scene = s;
    world = w;
    camera = c;
    renderer = r;
    uiScene = us;
    uiCamera = uc;

    ui = new UIManager();
    canvasUI = new CanvasUI(uiScene);
    room = new WebsimSocket();

    unsubscribeScores = room.collection('stacker_scores_v1').subscribe((scores) => {
        leaderboardScores = scores.sort((a, b) => b.score - a.score);
        if (!ui.leaderboardView.classList.contains('hidden')) {
            renderCurrentLeaderboardPage();
        }
    });

    const gameCallbacks = {
        onScoreUpdate: (score) => {
            // ui.updateScore(score); // This is now redundant as canvasUI handles the visible score
            canvasUI.updateScore(score);
        },
        onGameOver: (score) => {
            finalScore = score;
            setTimeout(() => {
                replayRecorder?.stop();
            }, 3000);
            ui.showGameOver(score);
        }
    };

    game = new Game(scene, world, dm, camera, gameCallbacks);
    
    setupEventListeners();
    
    renderer.setAnimationLoop(animate);
    startGame();
}

function startGame() {
    game.start();
    ui.hideGameOver();
    ui.showInstructions(true);
    canvasUI.updateScore(0);
    
    replayRecorder = new ReplayRecorder(renderer.domElement);
}

function restart() {
    replayRecorder?.stop();
    game.restart();
    startGame();
}

async function viewReplay() {
    ui.setReplayButtonState(true, 'Rendering...');
    const blob = await replayRecorder.getReplayBlob();
    if (blob) {
        ui.showReplayViewer(blob);
    }
    ui.setReplayButtonState(false, 'Watch Replay');
}

async function submitScore() {
    ui.setSubmitButtonState(true, 'Submitting...');
    const blob = await replayRecorder.getReplayBlob();

    if (!blob) {
        ui.setSubmitButtonState(false, 'Error');
        console.error('Replay blob not available');
        return;
    }

    try {
        const replay_url = await window.websim.upload(blob);
        const user = await window.websim.getCurrentUser();
        
        // This is a bit of a workaround for websim's eventually consistent DB
        // We'll give it a moment to fetch the user's scores if not already loaded.
        let userScores = room.collection('stacker_scores_v1').filter({ user_id: user.id }).getList();
        if (userScores.length === 0) {
             await new Promise(resolve => setTimeout(resolve, 1000));
             userScores = room.collection('stacker_scores_v1').filter({ user_id: user.id }).getList();
        }

        userScores.sort((a, b) => a.score - b.score);

        if (userScores.length >= 3) {
            const lowestScore = userScores[0];
            if (finalScore > lowestScore.score) {
                 await room.collection('stacker_scores_v1').update(lowestScore.id, {
                    score: finalScore,
                    replay_url
                });
            }
        } else {
             await room.collection('stacker_scores_v1').create({
                score: finalScore,
                replay_url,
                user_id: user.id
            });
        }
        ui.setSubmitButtonState(true, 'Submitted!');

    } catch(err) {
        console.error("Failed to submit score:", err);
        ui.setSubmitButtonState(false, 'Error');
    }
}

function viewLeaderboard() {
    leaderboardPage = 1;
    renderCurrentLeaderboardPage();
    ui.showLeaderboard();
}

function renderCurrentLeaderboardPage() {
    ui.renderLeaderboard(leaderboardScores, leaderboardPage, LEADERBOARD_PAGE_SIZE, (replayUrl) => {
        ui.showReplayViewer(replayUrl);
    });
}


function setupEventListeners() {
    ui.setupEventListeners({
        onPointerDown: () => {
            if (game.getState() === 'playing') {
                ui.showInstructions(false);
                game.onPointerDown();
            }
        },
        onRestart: restart,
        onViewReplay: viewReplay,
        onSubmitScore: submitScore,
        onViewLeaderboard: viewLeaderboard,
        onWindowResize: () => {
            const aspect = window.innerWidth / window.innerHeight;
            const frustumSize = 4;
            camera.left = frustumSize * aspect / -2;
            camera.right = frustumSize * aspect / 2;
            camera.top = frustumSize / 2;
            camera.bottom = frustumSize / -2;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);

            uiCamera.left = -window.innerWidth / 2;
            uiCamera.right = window.innerWidth / 2;
            uiCamera.top = window.innerHeight / 2;
            uiCamera.bottom = -window.innerHeight / 2;
            uiCamera.updateProjectionMatrix();
            canvasUI.onWindowResize();
        }
    });

    ui.leaderboardPrevButton.addEventListener('click', () => {
        if (leaderboardPage > 1) {
            leaderboardPage--;
            renderCurrentLeaderboardPage();
        }
    });

    ui.leaderboardNextButton.addEventListener('click', () => {
        const maxPage = Math.ceil(leaderboardScores.length / LEADERBOARD_PAGE_SIZE);
        if (leaderboardPage < maxPage) {
            leaderboardPage++;
            renderCurrentLeaderboardPage();
        }
    });
}

function animate() {
    world.step(1 / 60);
    game.update();
    
    renderer.render(scene, camera);
    renderer.render(uiScene, uiCamera);
}

init();