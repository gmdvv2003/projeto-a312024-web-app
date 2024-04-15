const { jwt } = require("jsonwebtoken");

const CardFunctionality = require("./modules/Card/CardFunctionality");
const PhaseFunctionality = require("./modules/Phase/PhaseFunctionality");
const MembersFunctionality = require("./modules/Members/MembersFunctionality");
const ChatFunctionality = require("./modules/Chat/ChatFunctionality");
const ProjectFunctionality = require("./modules/Project/ProjectFunctionality");
const UserEntity = require("../../../users/UsersEntity");
const Session = require("../../../../context/session/Session");

/**
 * Injeta funcionalidades no projeto.
 *
 * @param {string} name
 * @param {Function} next
 */
function injectFunctionality(name, next) {
	this.injectProjectFunctionality(name, next);
}

class Participant {
	subscribed = false;

	#user;
	#socketToken;

	constructor(user, socketToken) {
		this.#user = user;
		this.#socketToken = socketToken;
	}
}

class Project {
	#cards;
	#phases;

	constructor() {
		this.#cards = [];
		this.#phases = [];
	}
}

class ProjectsFunctionalityInterface {
	#projects = {};

	constructor(ProjectsController) {
		// Função de injeção de dependências
		const inject = injectFunctionality.bind(this);

		// Injetando dependências
		new CardFunctionality(this, inject);
		new PhaseFunctionality(this, inject);
		new MembersFunctionality(this, inject);
		new ChatFunctionality(this, inject);
		new ProjectFunctionality(this, inject);

		inject("IOSubscribeToProject", this.IOSubscribeToProject);
		inject("IOUnsubscribeFromProject", this.IOUnsubscribeFromProject);

		this.ProjectsController = ProjectsController;
	}

	/**
	 * Middleware que redireciona o socket para o projeto correto.
	 *
	 * @param {Function} next
	 */
	socketToProjectRedirector(next) {
		return (socket, data) => {
			const { projectId } = data;
			if (!projectId) {
				return socket.emit("error", { message: '"projectId" não informado.' });
			}

			// Verifica se o projeto existe
			const project = this.#projects[projectId];
			if (!project) {
				return socket.emit("error", { message: "Projeto não encontrado." });
			}

			// Verifica se o usuário é membro do projeto
			const isValidProjectMember = project.members.some((member) => {
				// Procura por um usuário que tenha o mesmo token de socket e que esteja inscrito no projeto
				return (
					member.socketToken === socket.handshake.auth.socketToken && member.subscribed
				);
			});
			if (!isValidProjectMember) {
				return socket.emit("error", { message: "Você não é membro deste projeto." });
			}

			next(project, socket, data);
		};
	}

	/**
	 * Método utilizado para injetar funcionalidades no projeto.
	 *
	 * @param {string} name
	 * @param {Function} next
	 */
	injectProjectFunctionality(name, next) {
		this[name] = this.socketToProjectRedirector(next.bind(this));
	}

	/**
	 * Adiciona um usuário como participante de um projeto, criando também um token de participação.
	 *
	 * @param {UserEntity} user
	 * @param {int} projectId
	 * @returns {[boolean, string]}
	 */
	addParticipant(user, projectId) {
		// Verifica se o projeto existe
		const project = this.#projects[projectId];
		if (!project) {
			return [false, null];
		}

		// Verifica se o usuário já é membro do projeto
		if (project.members.includes(user)) {
			return [false, null];
		}

		// Cria um token de participação do usuário no projeto
		const participationToken = jwt.sign(
			{ userId: user.userId, projectId: projectId },
			process.env.JWT_PRIVATE_KEY,
			{
				algorithm: "RS256",
			}
		);

		// Adiciona o usuário ao projeto (mas ainda sem autorização de participação)
		project.members.push(new Participant(user, participationToken));

		return [true, participationToken];
	}

	removeParticipant(user, projectId) {}

	/**
	 * Realiza a inscrição de um usuário em um projeto.
	 *
	 * @param {*} socket
	 * @param {*} data
	 */
	IOSubscribeToProject(project, socket, data) {
		const { socketToken } = socket.handshake.auth;
		if (!socketToken) {
			return socket.emit("error", { message: "Dados insuficientes." });
		}

		// Realiza a validação para obter o userId
		const [_, { userId }] = Session.validate(socketToken);

		// Procura o usuário nos membros do projeto
		const user = project.members.find((member) => {
			return member.user.userId === userId;
		});

		if (!user) {
			return socket.emit("error", { message: "Usuário não encontrado." });
		}

		// Atualiza o status de inscrição do usuário
		user.subscribed = true;
	}

	/**
	 * Realiza a remoção de um usuário de um projeto, invalidando o token de participação.
	 *
	 * @param {*} socket
	 * @param {*} data
	 */
	IOUnsubscribeFromProject(project, socket, data) {}
}

module.exports = ProjectsFunctionalityInterface;
