// Type linting
const UsersDTO = require("../../../users/UsersDTO");

const { Socket, Namespace, Server } = require("socket.io");

const CardFunctionality = require("./modules/Card/CardFunctionality");
const PhaseFunctionality = require("./modules/Phase/PhaseFunctionality");
const MembersFunctionality = require("./modules/Members/MembersFunctionality");
const ChatFunctionality = require("./modules/Chat/ChatFunctionality");
const ProjectFunctionality = require("./modules/Project/ProjectFunctionality");

const Session = require("../../../../context/session/Session");

const CardsDTO = require("../../../cards/CardsDTO");
const PhasesDTO = require("../../../phases/PhasesDTO");

const {
	DEFAULT_PAGE_SIZE,
} = require("../../../../context/decorators/typeorm/pagination/Pagination");

/**
 * Injeta funcionalidades no projeto.
 *
 * @param {string} name
 * @param {Function} next
 */
function injectFunctionality(name, next, authenticateless) {
	this.injectProjectFunctionality(name, next, authenticateless);
}

class Participant {
	subscribed = false;

	#user;
	#socketToken;

	constructor(user, socketToken) {
		this.#user = user;
		this.#socketToken = socketToken;
	}

	get user() {
		return this.#user;
	}

	get socketToken() {
		return this.#socketToken;
	}
}

class Project {
	projectId;

	#cards = [];
	#phases = [];

	members = [];

	constructor(projectId) {
		this.projectId = projectId;
	}

	/**
	 * @param {number} page
	 * @returns {Array}
	 */
	getCards(page) {
		return this.#cards.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE);
	}

	/**
	 * @param {number} page
	 * @returns {Array}
	 */
	getPhases(page) {
		return this.#phases.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE);
	}

	/**
	 * @param {CardsDTO} cardDTO
	 */
	addCard(cardDTO) {
		this.#cards.push(cardDTO);
	}

	/**
	 * @param {number} caseId
	 */
	removeCard(caseId) {
		this.#cards = this.#cards.filter((card) => card.cardId !== cardId);
	}

	/**
	 * @param {PhasesDTO} phaseDTO
	 */
	addPhase(phaseDTO) {
		this.#phases.push(phaseDTO);
	}

	/**
	 * @param {number} phaseId
	 */
	removePhase(phaseId) {
		this.#phases = this.#phases.filter((phase) => phase.phaseId !== phaseId);
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

		inject("IOSubscribeToProject", this.IOSubscribeToProject, true);
		inject("IOUnsubscribeFromProject", this.IOUnsubscribeFromProject, true);

		this.ProjectsController = ProjectsController;
	}

	/**
	 * Middleware que redireciona o socket para o projeto correto.
	 *
	 * @param {Function} next
	 */
	socketToProjectRedirector(next) {
		return (projectsIO, socket, data) => {
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

			try {
				next(projectsIO, socket, project, data);
			} catch (error) {
				socket.emit("error", { message: error.message });
			}
		};
	}

	/**
	 * Método utilizado para injetar funcionalidades no projeto.
	 *
	 * @param {string} name
	 * @param {Function} next
	 */
	injectProjectFunctionality(name, next, authenticateless = false) {
		this[name] = authenticateless
			? next.bind(this)
			: this.socketToProjectRedirector(next.bind(this));
	}

	/**
	 * Adiciona um usuário como participante de um projeto, criando também um token de participação.
	 *
	 * @param {UsersDTO} user
	 * @param {int} projectId
	 * @returns {[boolean, string]}
	 */
	addParticipant(user, projectId) {
		// "Cria" o projeto se ele não existir
		if (!this.#projects[projectId]) {
			this.#projects[projectId] = new Project(projectId);
		}

		const project = this.#projects[projectId];

		// Verifica se o usuário já é membro do projeto
		if (project.members.includes(user)) {
			return [false, null];
		}

		// Cria um token de participação do usuário no projeto
		const participationToken = Session.newSession(
			{
				userId: user.userId,
				projectId: projectId,
			},
			// O ano é 12023, o token expirou e agora a civilização está apuros...
			{ expiresIn: "9999 years" }
		);

		// Adiciona o usuário ao projeto (mas ainda sem autorização de participação)
		project.members.push(new Participant(user, participationToken));

		return [true, participationToken];
	}

	removeParticipant(user, projectId) {}

	/**
	 * Realiza a inscrição de um usuário em um projeto.
	 *
	 * @param {Namespace} projectsIO
	 * @param {Socket} socket
	 * @param {Project} project
	 * @param {*} data
	 */
	IOSubscribeToProject(projectsIO, socket, data) {
		// Verifica se o projeto existe
		const project = this.#projects[data.projectId];
		if (!project) {
			return socket.emit("error", { message: "Projeto não encontrado." });
		}

		const { socketToken } = socket.handshake.auth;

		// Realiza a validação para obter o userId
		const [_, { userId }] = Session.validate(socketToken);

		// Procura o usuário nos membros do projeto
		const user = project.members.find((member) => {
			return member.user.userId === userId;
		});

		if (!user) {
			return socket.emit("error", { message: "Usuário não encontrado." });
		}

		// Adiciona o socket a sala do projeto
		socket.join(project.projectId);

		// Atualiza o status de inscrição do usuário
		user.subscribed = true;

		// Envia a confirmação de inscrição
		socket.emit("subscribedToProject");
	}

	/**
	 * Realiza a remoção de um usuário de um projeto, invalidando o token de participação.
	 *
	 * @param {Namespace} projectsIO
	 * @param {Socket} socket
	 * @param {Project} project
	 * @param {Object} data
	 */
	IOUnsubscribeFromProject(projectsIO, socket, data) {}
}

module.exports = { Participant, Project, ProjectsFunctionalityInterface };
