const ProjectMembersDTO = require("./ProjectMembersDTO");
const ProjectMembersEntity = require("./ProjectMembersEntity");

class ProjectMembersInterface {
	#controller;

	constructor(controller) {
		this.#controller = controller;
	}

	/**
	 * Adiciona um usuário como membro de um projeto.
	 *
	 * @param {number} userId
	 * @param {number} projectId
	 */
	addUserAsMemberOfProject(userId, projectId) {
		// Verifica se o usuário não é membro do projeto
		if (!this.isUserMemberOfProject(userId, projectId)) {
			// Adiciona um novo membro ao projeto
			this.#controller.getService().Members.push(new ProjectMembersEntity(userId, projectId));
		}
	}

	/**
	 * Remove um usuário dos membros de um projeto.
	 *
	 * @param {number} userId
	 * @param {number} projectId
	 */
	removeUserFromMembersOfProject(userId, projectId) {
		// Verifica se o usuário é membro do projeto
		if (this.isUserMemberOfProject(userId, projectId)) {
			// Filtra os membros que não contém o userId e projectId e atualiza a lista de membros com a lista filtrada
			this.#controller.getService().Members = this.#controller
				.getService()
				.Members.filter(
					(member) => member.userId !== userId || member.projectId !== projectId
				);
		}
	}

	/**
	 * Retorna os membros de um projeto.
	 *
	 * @param {number} projectId
	 * @returns {ProjectMembersDTO[]}
	 */
	getMembersOfProject(projectId) {
		// Filtra os membros que contém o projectId
		const members = this.#controller
			.getService()
			.Members.filter((member) => member.projectId === projectId);

		// Roda o map alterando o formato dos membros filtrados
		return members.map((member) => new ProjectMembersDTO(member.userId, member.projectId));
	}

	/**
	 * Retorna os projetos de um usuário.
	 *
	 * @param {number} userId
	 * @returns {ProjectMembersDTO[]}
	 */
	getProjectsOfUser(userId) {
		// Filtra os projetos que contém o userId
		const projects = this.#controller
			.getService()
			.Members.filter((member) => member.userId === userId);

		// Roda o map alterando o formato dos projetos filtrados
		return projects.map((project) => new ProjectMembersDTO(project.userId, project.projectId));
	}

	/**
	 * Indica se o usuário é membro do projeto.
	 *
	 * @param {number} userId
	 * @param {number} projectId
	 * @returns {number}
	 */
	isUserMemberOfProject(userId, projectId) {
		// Roda o some para verificar se algum membro contém o userId e projectId
		return this.#controller
			.getService()
			.Members.some((member) => member.userId === userId && member.projectId === projectId);
	}
}

module.exports = ProjectMembersInterface;
